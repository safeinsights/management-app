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
- [ ] **`src/lib/permission-types.ts` change approved** — adds a `LegalDocument` subject to the
      `Abilities` union. Note this is _permission-types_, not `permissions.ts`: SI admins already
      hold `('manage','all')` (`permissions.ts:117`), so **no rule changes are needed** — the union
      arm exists only so `.requireAbilityTo('create', 'LegalDocument')` type-checks.
- [ ] Confirm working directly on KC's branch vs. a branch off it.

---

## Tasks

### 1. Migration

- [x] Create `src/database/migrations/1780400000000_legal_documents.ts` — **done**. One addition
      beyond this plan: a `legal_document_version_draft_or_published` CHECK asserting
      `published_at`, `published_by` and `version_number` are all set or all null, since
      "`published_by` NOT NULL on publish" cannot be expressed as a column constraint. Rules out
      half-published rows that read paths would otherwise have to defend against.

```ts
import { type Kysely, sql } from 'kysely'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
    await db.schema.createType('legal_document_type').asEnum(['tos', 'pn', 'ropa', 'dopa', 'sla']).execute()

    await db.schema
        .createTable('legal_document')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('type', sql`legal_document_type`, (col) => col.notNull())
        // Scope: ropa/dopa are org-wide, sla is per-study, tos/pn are global.
        // An SLA stores only study_id — its Research Lab (study.submitted_by_org_id) and
        // Data Partner (study.org_id) are both derivable, so copies would only drift.
        .addColumn('org_id', 'uuid', (col) => col.references('org.id'))
        .addColumn('study_id', 'uuid', (col) => col.references('study.id'))
        .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addCheckConstraint(
            'legal_document_scope_matches_type',
            sql`(type IN ('tos','pn') AND org_id IS NULL AND study_id IS NULL)
             OR (type IN ('ropa','dopa') AND org_id IS NOT NULL AND study_id IS NULL)
             OR (type = 'sla' AND study_id IS NOT NULL AND org_id IS NULL)`,
        )
        .execute()

    // NULLS NOT DISTINCT is load-bearing: by default Postgres treats NULLs as distinct, so a
    // plain UNIQUE would happily allow two ('tos', NULL, NULL) rows. Requires PG >= 15; we run 16.
    await sql`
        ALTER TABLE legal_document
        ADD CONSTRAINT legal_document_scope_unique
        UNIQUE NULLS NOT DISTINCT (type, org_id, study_id)
    `.execute(db)

    await db.schema
        .createTable('legal_document_version')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('legal_document_id', 'uuid', (col) => col.notNull().references('legal_document.id'))
        // Assigned at publish time (max+1), so it is null while the row is a draft.
        .addColumn('version_number', 'integer')
        .addColumn('file_path', 'text', (col) => col.notNull())
        .addColumn('format', 'text', (col) => col.notNull())
        // Null published_at means draft. Once set, the row is immutable: corrections ship as a new
        // version so that acknowledgements always point at exactly the bytes the user agreed to.
        .addColumn('published_at', 'timestamptz')
        .addColumn('published_by', 'uuid', (col) => col.references('user.id'))
        // The calendar day a signatory signed outside the app (Zoho), typed in by an SI admin —
        // distinct from published_at, which is when it went live here. Deliberately `date`, not
        // timestamptz: a signing day has no time or zone, and storing it as an instant would
        // render as the previous day for western viewers. Unused by tos/pn.
        // NOTE: this is the repo's first `date` column and there are no custom pg type parsers,
        // so node-postgres will parse it into a JS Date at local midnight — calling toISOString()
        // on that reintroduces the off-by-one. Register an OID 1082 parser (or format carefully)
        // when 276/277 first surface this in the UI.
        .addColumn('signed_at', 'date')
        .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addUniqueConstraint('legal_document_version_number_unique', ['legal_document_id', 'version_number'])
        .execute()

    // At most one unpublished draft per document, so "upload → review → publish" is unambiguous.
    await sql`
        CREATE UNIQUE INDEX legal_document_single_draft
        ON legal_document_version (legal_document_id)
        WHERE published_at IS NULL
    `.execute(db)

    await sql`
        CREATE INDEX legal_document_version_current
        ON legal_document_version (legal_document_id, published_at DESC)
    `.execute(db)

    await db.schema
        .createTable('legal_document_acknowledgement')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`v7uuid()`))
        .addColumn('legal_document_version_id', 'uuid', (col) => col.notNull().references('legal_document_version.id'))
        .addColumn('user_id', 'uuid', (col) => col.notNull().references('user.id'))
        .addColumn('acked_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
        .addUniqueConstraint('legal_document_acknowledgement_unique', ['legal_document_version_id', 'user_id'])
        .execute()

    await db.schema
        .createIndex('legal_document_acknowledgement_user')
        .on('legal_document_acknowledgement')
        .column('user_id')
        .execute()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('legal_document_acknowledgement').execute()
    await db.schema.dropTable('legal_document_version').execute()
    await db.schema.dropTable('legal_document').execute()
    await db.schema.dropType('legal_document_type').execute()
}
```

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

### 2. Zod schemas — `src/schema/legal-document.ts`

- [ ] `legalDocumentTypeSchema` — `z.enum(['tos','pn','ropa','dopa','sla'])`
- [ ] `createLegalDocumentDraftSchema` — `{ type, orgId?, studyId?, fileName, format }`
- [ ] `publishLegalDocumentVersionSchema` — `{ versionId, signedAt? }`
- [ ] `acknowledgeLegalDocumentSchema` — `{ versionId }`
- [ ] Mirror the DB CHECK in Zod via `.superRefine` so bad scope fails validation before hitting
      the constraint and returning an opaque error

### 3. Permissions — `src/lib/permission-types.ts`

- [ ] Add to the `Abilities` union:
      `| Ability<'LegalDocument', 'view' | 'create' | 'publish', { orgId?: UUID; studyId?: UUID }>`
- [ ] No `permissions.ts` change — SI admin's `('manage','all')` already covers it. Confirm by
      reading `defineAbilityFor` before assuming.
- [ ] Decide (defer if unclear): non-SI-admin users need `'view'`/acknowledge rights for 275.
      For now only SI-admin paths are exercised; revisit with 275.

### 4. S3 paths — `src/lib/paths.ts`

- [ ] `pathForLegalDocument = (type, documentId) => \`legal/${type}/${documentId}\``
- [ ] `pathForLegalDocumentVersionFile = (type, documentId, versionId, fileName) =>
  \`${pathForLegalDocument(type, documentId)}/${versionId}/${sanitizeFileName(fileName)}\``
- [ ] Key on `versionId`, not `versionNumber` — drafts have no number yet

### 5. Server actions — `src/server/actions/legal-document.actions.ts`

All use `new Action(...)` from `./action`. Mutating actions pass `{ performsMutations: true }`.

- [ ] **`createLegalDocumentDraftAction`** — `requireAbilityTo('create','LegalDocument')`.
      Find-or-create the `legal_document` for the scope (no seeds; the unique constraint makes this
      safe), insert a draft version row, return the row plus `createSignedUploadUrl(path)`.
      Replaces any existing draft — the partial unique index enforces one at a time, so delete the
      prior draft in the same transaction.
- [ ] **`publishLegalDocumentVersionAction`** — `requireAbilityTo('publish','LegalDocument')`.
      In a **single transaction**: assert the version is still a draft, compute
      `version_number = COALESCE(MAX(version_number), 0) + 1` for that document, set
      `published_at = now()`, `published_by = session.user.id`, and `signed_at` if supplied.
      The unique constraint on `(legal_document_id, version_number)` catches concurrent publishes.
      **Must not use `deferred()`** — see gotchas.
- [ ] **`fetchLegalDocumentVersionsAction`** — `requireAbilityTo('view','LegalDocument')`.
      Params `{ type, orgId?, studyId? }`. Returns published versions newest-first with
      `version_number`, `published_at`, `signed_at`, publisher name, and a `signedUrlForFile` link,
      plus the current draft if any. Current version = first row.
- [ ] **`fetchLegalDocumentAcknowledgementsAction`** — `requireAbilityTo('view','LegalDocument')`.
      274's audit list. Params `{ type, sort }`. Shape: `selectFrom('user')`, left join
      `orgUser`→`org`, left join the user's latest acknowledgement of that document type via a
      `distinctOn` subquery — mirror the existing `distinctOn` pattern in
      `getUsersForOrgAction` (`org.actions.ts:217-260`), which does exactly this for audit
      timestamps. Returns name, email, org, acknowledged `version_number` (or null), `acked_at`.
- [ ] **`acknowledgeLegalDocumentAction`** — `requireAbilityTo('view','LegalDocument')`.
      Insert `(versionId, session.user.id)` with `onConflict().doNothing()` so a double-submit is
      idempotent. Ships now; no caller until 275.

**Open question for the UI (KC):** a user can belong to multiple orgs, so the audit list join can
produce more than one row per user. Decide whether to emit one row per membership or aggregate org
names into a single cell.

### 6. Tests

Co-located `.test.ts` files, real DB, no mocking of our own code (CONVENTIONS.md). S3-touching
tests use `describe.skipIf(!s3Available)` from `tests/s3.helpers.ts`.

- [ ] Scope CHECK rejects bad combinations (e.g. `tos` with an `org_id`; `sla` without a `study_id`)
- [ ] `UNIQUE NULLS NOT DISTINCT` rejects a second `('tos', NULL, NULL)` document
- [ ] Partial index rejects a second draft for the same document
- [ ] Publish assigns `version_number` 1, then 2 on the next publish
- [ ] Publishing an already-published version fails
- [ ] `fetchLegalDocumentVersionsAction` returns history newest-first with the current version first
- [ ] Audit list returns every user with `null` acknowledgement before any ack, and the correct
      `version_number` + `acked_at` after one
- [ ] `acknowledgeLegalDocumentAction` is idempotent on double-submit
- [ ] Non-SI-admin is denied on create/publish

### 7. Validation

- [ ] `pnpm run lint:fix`
- [ ] `pnpm run test:unit` (DB-backed vitest runs inside the `mgmnt-app` docker container, one file
      at a time)
- [ ] `pnpm run checks` — types + lint + `validate-actions`

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
- **`signed_at` driver hazard** — see the migration comment. Not exercised this pass.
- **The epic ships to `main` as one unit**, so this migration can be amended in place as 276/277
  teach us things rather than stacked with corrective migrations. `allowUnorderedMigrations: true`
  is already set in `kysely.config.ts`, so the long-lived branch's timestamp won't conflict.
- **Do not commit these planning docs** unless explicitly asked (CLAUDE.md).
