# Legal Documents Foundation — Implementation Plan

**Date:** 2026-07-27
**Epic:** [SHRMP-273](https://openstax.atlassian.net/browse/SHRMP-273) · **Card:** [SHRMP-274](https://openstax.atlassian.net/browse/SHRMP-274)
**Design spec:** `docs/plans/2026-07-27-legal-documents-design.md`
**Branch:** `SHRMP-274/instantiate-legal-page` (shared with KC, who owns the UI)

**Goal:** Land the database schema and server-side operations for versioned legal documents
(ToS/PN/ROPA/DOPA/SLA) plus per-user acknowledgement, so 274's UI has a real API to build against
and 275/276/277 need only additive work.

**Architecture:** Three tables (`legal_document` → `legal_document_version` →
`legal_document_acknowledgement`), content in S3, audience derived rather than stored, publish is
irreversible. Full rationale in the design spec — read it first.

**Tech stack:** Postgres 16, Kysely + `kysely-ctl` migrations, Zod schemas, the `Action` builder in
`src/server/actions/action.ts`, CASL permissions, S3 via `src/server/aws.ts`, vitest.

---

## Scope

**In scope:** enum + 3 tables, regenerated DB types, Zod schemas, `LegalDocument` permission
subject, S3 path builders, 5 server actions, unit tests.

**Out of scope (deferred):** the 275 login-enforcement modal and its "does this user owe an
acknowledgement" check; wiring `terms-checkbox.tsx` at signup; any 276/277 UI. The acknowledgement
_write_ action ships, but nothing calls it yet.

**Known consequence:** the audit list returns "none" for every user until 275 or the signup wiring
lands. Expected.

---

## Approval gates (CLAUDE.md)

- [x] **Migration approved** by Chris — required before creating any migration file.
- [x] **`src/lib/permission-types.ts` change** — adds a `LegalDocument` subject to the `Abilities`
      union. This is _permission-types_, not `permissions.ts`: SI admins already hold
      `('manage','all')` (`permissions.ts:117`), so **no rule changes were needed** — the union arm
      exists only so `.requireAbilityTo('create', 'LegalDocument')` type-checks.
- [x] Working directly on KC's branch (`SHRMP-274/instantiate-legal-page`), which the whole epic
      merges from as one unit.
- [ ] **`permissions.ts` rule changes for non-SI-admins** — not yet requested or made. Its own gate,
      needed before 275.

---

## Tasks

### 1. Migration

- [x] Create `src/database/migrations/1780400000000_legal_documents.ts` — **done**. One addition
      beyond this plan: a `legal_document_version_draft_or_published` CHECK asserting
      `published_at`, `published_by` and `version_number` are all set or all null, since
      "`published_by` NOT NULL on publish" cannot be expressed as a column constraint. Rules out
      half-published rows that read paths would otherwise have to defend against.

The migration as committed lives at `src/database/migrations/1780400000000_legal_documents.ts` —
read it there rather than from a copy in this document, which would only drift. Its inline comments
carry the reasoning for each non-obvious constraint.

- [x] Run `pnpm db:migrate` — **note:** must run inside the container
      (`docker compose run --rm --no-deps mgmnt-app pnpm db:migrate`). Postgres publishes no host
      port and `.env` has no `DATABASE_URL`, so running it from the host fails looking for
      `DB_SECRET_ARN`. `db:migrate` also regenerates types, runs seeds and `seed-environment.ts`.
- [x] Verify the `DB` interface gained `legalDocument`, `legalDocumentVersion`,
      `legalDocumentAcknowledgement`, and that `LegalDocumentType` is a union type — all present.
      `signed_at` generated as `Timestamp | null` (a JS `Date`), confirming the OID 1082 hazard
      documented in the migration.
- [x] Verified all constraints by attempting to violate each one (17 checks, rolled back): duplicate
      global ToS, every bad scope combination, a second concurrent draft, half-published rows,
      duplicate `version_number`, duplicate acknowledgement, and `signed_at` round-tripping as the
      same calendar day.
- [x] Verified `down()` drops all three tables plus the enum, and re-applying restores them with
      constraints intact.
- [x] `pnpm run lint:fix` and `pnpm run checks` (typecheck + eslint + prettier + validate-actions)
      all pass.

### 2. Zod schemas — `src/schema/legal-document.ts` ✅ done

- [x] `legalDocumentTypeSchema` — `z.enum(['tos','pn','ropa','dopa','sla'])`
- [x] `legalDocumentFormatSchema` — `z.enum(['markdown','pdf'])`
- [x] `legalDocumentScopeSchema` — `{ type, orgId?, studyId? }` + scope refinement; reused by both
      fetch actions
- [x] `createLegalDocumentDraftSchema` — scope + `{ fileName, format }`
- [x] `publishLegalDocumentVersionSchema` — `{ versionId, signedAt? }`. `signedAt` is validated as a
      **`'YYYY-MM-DD'` string**, not a `Date`, so it never passes through a timezone conversion on
      its way to the `date` column.
- [x] `acknowledgeLegalDocumentSchema` — `{ versionId }`
- [x] `fetchLegalDocumentAcknowledgementsSchema` — scope + optional
      `sort: { columnAccessor: 'fullName' | 'email' | 'ackedAt', direction }`
- [x] Mirror the DB CHECK in Zod via `.superRefine` so bad scope fails validation before hitting
      the constraint and returning an opaque error

### 3. Permissions — `src/lib/permission-types.ts` ✅ done

- [x] Added to the `Abilities` union — note the action list gained `acknowledge`, which this plan
      originally folded into `view`:
      `| Ability<'LegalDocument', 'view' | 'create' | 'publish' | 'acknowledge', { orgId?: UUID; studyId?: UUID }>`
- [x] No `permissions.ts` change — confirmed `defineAbilityFor` grants SI admins `('manage','all')`
      at `permissions.ts:117`, which covers every action above.
- [ ] **Still open:** non-SI-admin users need `acknowledge` (and probably `view`) granted in
      `permissions.ts` before 275's modal can work. Deliberately untouched here — no UI needs it yet,
      and it is a real permission-rule change requiring its own approval.

### 4. S3 paths — `src/lib/paths.ts` ✅ done

Final signatures take an object rather than the positional args this plan sketched:

- [x] `pathForLegalDocumentVersion({ type, legalDocumentId, versionId })` → `legal/<type>/<docId>/<versionId>`
      — this is the **prefix** handed to `createSignedUploadUrl`
- [x] `pathForLegalDocumentVersionFile(parts, fileName)` → the above plus `/<sanitizeFileName(fileName)>`
      — this is what gets stored in `file_path`
- [x] Keyed on `versionId`, not `versionNumber` — drafts have no number yet, and per-version prefixes
      make collisions between a replaced draft and a published file impossible

### 5. Server actions — `src/server/actions/legal-document.actions.ts`

All use `new Action(...)` from `./action`. Mutating actions pass `{ performsMutations: true }`, which
— discovered while implementing — **already wraps the whole handler in `db.transaction()`**
(`action.ts:190`). No transaction needs to be hand-rolled, contrary to what this plan first said.

- [x] **`createLegalDocumentDraftAction`** — `create`. Find-or-create the `legal_document` (insert
      with `onConflict().constraint('legal_document_scope_unique').doNothing()`, falling back to a
      select, so a concurrent first upload cannot 500), delete any pending draft, insert a new draft
      with a pre-generated `uuidv7` id, return `{ legalDocument, version, upload }` where `upload` is
      a `PresignedPost` for the existing `uploadFiles` hook.
- [x] **`publishLegalDocumentVersionAction`** — `publish`, behind the `scopeFromVersionId` middleware.
      Asserts the version is still a draft, sets `published_at`/`published_by`/`version_number =
  max+1`, plus `signed_at` when supplied. The update carries a `where('publishedAt','is',null)`
      guard so a concurrent second publish claims zero rows and throws instead of overwriting.
- [x] **`fetchLegalDocumentVersionsAction`** — `view`. Returns
      `{ legalDocumentId, current, history, draft }`, each version carrying `versionNumber`,
      `publishedAt`, `signedAt`, `publishedByName` and a `downloadUrl`. Returns all-null/empty when
      the document has never been uploaded.
- [x] **`fetchLegalDocumentAcknowledgementsAction`** — `view`. 274's audit list. Fetches the audience
      and the per-user latest acknowledgement (`distinctOn`, mirroring `getUsersForOrgAction`)
      separately, then merges. Returns `{ legalDocumentId, users }` with
      `{ userId, fullName, email, orgs[], acknowledgedVersionNumber, ackedAt }`.
- [x] **`acknowledgeLegalDocumentAction`** — `acknowledge` (not `view` as first planned), behind
      `scopeFromVersionId`. Refuses to acknowledge a draft — recording consent to something never
      shown would be false evidence — and is idempotent via `onConflict().doNothing()`, preserving the
      original `acked_at`. Ships now; no caller until 275.

**`scopeFromVersionId` middleware (not in the original plan).** `requireAbilityTo('acknowledge',
'LegalDocument')` would not compile — `{ orgId?, studyId? }` is a _weak type_ (all-optional), so
TypeScript rejects params sharing none of its properties, surfacing as
`Argument of type '"LegalDocument"' is not assignable to parameter of type 'never'`. Rather than
loosen the ability type, publish and acknowledge both run a middleware that resolves the document's
`orgId`/`studyId` from the version id. This fixes the typing _and_ makes the permission check
meaningful, so a future "org admin publishes only their own org's agreements" rule needs no changes
to the actions.

**Resolved (was an open question for KC):** a user can belong to several orgs, so the audit list now
collapses each person into one row carrying an `orgs: [{ name, type }]` array rather than repeating
them per membership. KC can render that as a joined cell or expand it; switching to one-row-per-
membership is a small change if the table design prefers it.

### 6. Tests — `src/server/actions/legal-document.actions.test.ts` ✅ 20 tests, all passing

Real DB. **No `skipIf(!s3Available)`** as this plan first assumed: these actions only _generate_ a
presigned URL (the browser does the upload), so there is nothing real to hit. The two AWS presign
helpers are stubbed — following the existing precedent in `org.actions.test.ts` — which keeps the
suite runnable without SeaweedFS.

- [x] Draft creation stores `file_path` under the version's own prefix, and the presigned prefix is
      asserted to be exactly the directory that path sits in (if those drift, uploads land where no
      row points)
- [x] Repeat upload reuses the same document (only one `legal_document` row per scope)
- [x] Repeat upload replaces the pending draft (only one outstanding)
- [x] Bad scope rejected in both directions (`tos` with an org; `ropa` without one)
- [x] Publish numbers versions 1 then 2 and records `publishedBy`
- [x] Republishing an already-published version fails
- [x] `signed_at` stores the calendar day it was given — asserted via `signed_at::text` in SQL, since
      reading it through the driver would pass or fail depending on the machine's timezone
- [x] Fetch separates current / history / pending draft, and reports nothing for an unused document
- [x] Acknowledgement recorded; idempotent on re-submit with the original `acked_at` preserved;
      refused for a draft
- [x] Audit list null before acknowledging, correct version after, newest version when several were
      acknowledged, and multi-org users collapsed to one row
- [x] Non-SI-admin denied on create, publish, and the audit list

Two testing gotchas worth knowing for the next test file: `mockReset: true` in `vitest.config.ts`
clears mock _implementations_ before each test, so a `vi.mock` factory's `mockResolvedValue` returns
`undefined` inside tests — assert on what the action _passes_ to a stub, not on the stub's return.
And the audit list returns every user in the shared test DB, so assertions must find their specific
user rather than assert on totals.

### 7. Validation ✅ all green

- [x] `pnpm run lint:fix` — note the repo's custom `noSelectAllWithoutArgs` rule: `selectAll()` must
      be called as `selectAll('tableName')`
- [x] `pnpm run test:unit` — **222 files, 2066 tests passing**, no regressions from the shared
      `paths.ts` / `permission-types.ts` edits. Runs inside the container:
      `docker compose run --rm --no-deps mgmnt-app pnpm run test:unit`
- [x] `pnpm run checks` — typecheck + eslint + prettier + `validate-actions`

---

## Gotchas

- **`deferred()` is fire-and-forget** (`src/server/events.ts`) with no retry, timeout, or state —
  it is what silently lost AI code-review jobs. Publishes and acknowledgements must be synchronous
  and transactional. Only emails belong in `deferred()`.
- **`UNIQUE NULLS NOT DISTINCT`** — without it, Postgres allows unlimited `('tos', NULL, NULL)`
  rows. Easy to miss in review.
- **`study.orgId` is the Data Partner; `study.submittedByOrgId` is the Research Lab.** Trivially
  easy to invert. Confirmed via `1759506202736_add_submitted_by_org_to_study.ts` and the comment at
  `study-request.ts:640`.
- **`signed_at` driver hazard** — see the migration comment. Not exercised this pass; the one test
  that touches it deliberately reads through a SQL cast rather than the driver.
- **`performsMutations: true` gives you a transaction for free** (`action.ts:190`). Do not open one
  by hand inside a handler.
- **`createSignedUploadUrl` takes a directory prefix**, not a key — S3 appends the client's filename
  (`aws.ts:396`). The server cannot dictate the exact key, which is why each version uploads under a
  prefix containing its own id and `file_path` is built from the same `fileName` the client sends.
- **All-optional ability conditions are weak types.** An action whose params share no property with
  `{ orgId?, studyId? }` fails to compile with a confusing `type 'never'` error. Add a middleware
  that supplies the scope rather than loosening the ability type.
- **The epic ships to `main` as one unit**, so this migration can be amended in place as 276/277
  teach us things rather than stacked with corrective migrations. `allowUnorderedMigrations: true`
  is already set in `kysely.config.ts`, so the long-lived branch's timestamp won't conflict.

---

## Still outstanding after this pass

**Needs a product answer**

- Does the **SLA supersede the DUA section** of the study agreements page? Both are study-level
  agreements and the DUA/IRB/SOW page is still a placeholder. Wanted before 277.
- Should the **signup checkbox be persisted**? Uncarded (ToS/PN Goal 3), and today a user affirms
  agreement with nothing recorded. It is the cheapest way to put real data in 274's audit list, which
  is otherwise all-null by design.
- **ToS/PN Goals 3 and 5 are uncarded** (real links at signup; user-facing Legal page). Gap or
  intentional?
- The hand-off doc asks engineering to **propose a compliance-verification process** an SI admin
  could actually follow. Not designed.

**Engineering, deferred deliberately**

- **`permissions.ts` rules for non-SI-admins** — required before 275's modal can let an ordinary user
  acknowledge anything. Its own approval gate.
- **275's "does this user owe an acknowledgement" check** and the login modal.
- **OID 1082 date parser** — needed the first time `signed_at` is rendered (276/277).
- **Orphaned S3 objects** from superseded drafts are never deleted. Harmless (unreachable, never
  published), but it is real litter if someone re-uploads repeatedly.
- **`format` has no CHECK constraint** — it is plain `text` holding `markdown`/`pdf`. Cheap to tighten
  if we want the DB to enforce it.
