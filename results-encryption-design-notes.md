# Results Encryption for Researchers — Design Notes

> Working synthesis from grilling session against codebase (management-app + trusted-output-app).
> Status: **draft for review.** Locked decisions marked ✅; open items in §8.
> **Scope: Card 72 (prerequisite) → Card 71 only.** Happy path only. Cards 73/74 (regeneration, recovery) explicitly out of scope.
> **All phases land on one branch/PR (`researcher-encrypted-results`).** Not split per-card.
> **Progress: Card 72 code complete on branch (not yet merged to main). Card 71 in progress (re-encrypt approach).**
> **Testing: local e2e unreliable — rely on CI for e2e coverage. Unit tests still run/pass locally.**
>
> ## ⚠️ APPROACH PIVOT (supersedes §3–§5, §10 below)
>
> The detailed "Proposed implementation" (decompose the post office into Postgres + **re-wrap** PO boxes for researchers — §4.2, §4.3, Option B) was **built and then reverted**. We pivoted to **re-encrypt at approve** (Phil + NS in the living doc). See **§11** for the chosen design. Sections §3–§5/§10 are kept for rationale/history but are NOT the implementation.
>
> **Why pivot:** re-wrap forced encryption-library changes + new schema (`study_job_file_key`, decompose-on-ingest) + a full read-path rewrite. Re-encrypt needs **zero lib changes, no schema** — the DO browser already holds plaintext at review time, so at approve it re-encrypts the approved files for reviewers+researchers using the existing `ResultsWriter`. It also matches the living doc's own Card 74 recovery mechanic ("remove old lock, put new lock" = re-encrypt), so it's the better foundation for the documented future work. The one thing re-wrap/boxes does better — granular **revocation** ("user leaves the lab") — is noted in code at the approve site as a future consideration.

---

## 1. The problem

Enclave output (result files + run logs) delivered to **DO reviewers** encrypted, but same output currently exposed to **researchers in plaintext**. Reviewers decrypt client-side with private key generated at signup; researchers get unencrypted copy.

Goal: researchers must _also_ decrypt with own key, so output never available plaintext on researcher side.

---

## 2. How encryption works today (the "post office" analogy)

| Concept (analogy)                                              | Implementation                                                                                   | Where in code                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| **Results key** — padlock whose one key both locks and unlocks | Random **AES-256-CBC** symmetric key, generated **per file** (+ per-file random IV)              | `si-encryption/job-results/writer.ts:19,22`                  |
| **Lock the results**                                           | Encrypt each file's bytes with its AES key                                                       | `writer.ts:25`                                               |
| **PO box per person**                                          | AES key "wrapped" (encrypted) with each recipient's **RSA-OAEP-4096 public key**                 | `writer.ts:31-35,58-84`                                      |
| **PO box number**                                              | Recipient's **fingerprint** = SHA-256 of public key                                              | `util/keypair.ts:105-111`                                    |
| **Post office (directory of boxes)**                           | `manifest.json` — maps `fingerprint → { crypt }`, plus per-file `iv`, `path`, `bytes`            | `writer.ts:39-44`; types in `job-results/types.ts`           |
| **Ship it**                                                    | TOA zips `manifest.json` + encrypted bodies, POSTs to MA                                         | TOA `src/app/api/job/encrypt-results.ts`                     |
| **Open the box**                                               | Browser fetches zip, finds its PO box by fingerprint, unwraps AES key with private key, decrypts | `hooks/use-decrypt-files.ts`, `job-results/reader.ts:95-109` |

**Key types, ELI5**

- **RSA keypair (asymmetric)** — public key = mail slot anyone can drop into; private key = only physical key that opens box. Mathematically bound; can't edit one to fit other.
- **AES key (symmetric)** — one key locks and unlocks. Fast; used for big file bodies. One per file.
- **IV (initialization vector)** — per-file random value, **not secret**, but **required** to decrypt (AES-CBC). Must travel with ciphertext.
- **Fingerprint** — nameplate on box; SHA-256 of public key.
- **Envelope encryption** — lock big file once with fast AES padlock, then put _copy_ of that AES key into personal RSA-locked box per recipient. Manifest = directory of boxes.

**Where keys live**

- **Public key** → DB `user_public_key` (`public_key` bytea, `fingerprint` text, `UNIQUE(user_id)`). Schema already **role-agnostic**.
- **Private key** → user downloads PEM; **never stored server-side**. Core guarantee: _server cannot read results._

---

## 3. The fact that reframes the work

Approve currently stores **plaintext**. `approveStudyJobFilesAction` (`src/server/actions/study-job.actions.ts:12-45`) takes DO's already-decrypted contents and writes them to `results/approved/` via `storeApprovedJobFile`. Researchers read those plaintext files. Project = _"stop writing decrypted copy, give researchers own PO boxes instead."_

---

## 4. Architecture decisions (locked)

### ✅ 4.1 One key per user, not per role (Card 72)

Single keypair serves person as reviewer _and_ researcher. Encryption already takes all org public keys regardless of role (`writer.ts`), so same key works for both hats. Consequence: key handling is user-level, not role-level.

### ✅ 4.2 Re-wrap, not re-encrypt (core mechanic)

Granting researcher access does **not** re-encrypt file bodies. File's existing AES key **wrapped again** for researcher's public key → new PO box. Ciphertext and IV never change.

- DO's browser already holds raw AES key (just decrypted to review), so it wraps that key for each researcher and uploads new boxes. **Server never sees plaintext.**
- Regenerated key cannot open old boxes — that impossibility _is_ the security. (Recovery/regeneration = out of scope; see §8.)

### ✅ 4.3 Option B — decompose on ingest

When MA receives TOA's zip, **unzips once on server** and stores pieces separately:

- each **encrypted body** → own S3 object
- per-file **metadata (iv, path, bytes)** + per-recipient **wrapped keys** → Postgres

Manifest is **plaintext metadata** (IVs/fingerprints/wrapped keys not secret), and server already parses it today with empty key to list files (`study-job.actions.ts:72-76`). Decompose-on-ingest needs **no private keys, touches no plaintext** — zero-plaintext-on-server guarantee holds.

Postgres = **single source of truth for PO boxes** (DO and researcher). Zip reduced to transient ingest format; read path no longer unzips.

**Schema (DECIDED: extend existing `study_job_file`, do NOT add a new `job_file` table).** `study_job_file` already models one-row-per-file with `source_id` linkage; reuse it to avoid duplicating the file concept and migrating references.

```
study_job_file      -- EXISTING (1750186286777). Add nullable: iv text
                       path = S3 object key of the body (existing invariant across all 12 consumers)
                       name = logical/inner filename
                       (NO blob_location — would be redundant with path; dropped after consumer audit)
study_job_file_key  (id, study_job_file_id → study_job_file.id, fingerprint, crypt, created_at)
                       UNIQUE(study_job_file_id, fingerprint)   -- one row per recipient-per-file = a PO box
```

**Model inversion:** today 1 `study_job_file` row = 1 zip holding many files (client gets whole blob + `ResultsReader.listFiles()`). Option B: **1 row = 1 decomposed file** (`path`=S3 key of body, `iv` on row, wrapped keys in `study_job_file_key`).

**Coupling:** ingest (writes decomposed rows) and `fetchEncryptedJobFilesAction` + `use-decrypt-files`/`use-encrypted-files-panel` share the row contract. They must change **together** — ingest cannot land alone without breaking the review read path.

**Read path (DO and researcher, identical):** fetch encrypted body from S3 (`path`) + `iv` and row matching _my_ fingerprint from `study_job_file_key` → `decryptFile({encryptedBody, iv, crypt, privateKey})`. `SELECT crypt FROM study_job_file_key WHERE fingerprint = ? AND study_job_file_id IN (...)` (one box per file).

### ✅ 4.4 Re-wrap at approve, client-side (Card 71)

On **Approve**, DO's browser:

1. Fetches **lab's** public keys — members of `study.submittedByOrgId` who have key.
2. Wraps each approved file's AES key (already in memory from decrypting) to each researcher public key.
3. POSTs new PO boxes; server inserts `job_file_key` rows in one transaction (atomic, idempotent via unique constraint).

### ✅ 4.5 Remove plaintext storage

Drop `storeApprovedJobFile` plaintext write. Researchers read encrypted body + their PO box and decrypt client-side, using **same** path as reviewers.

---

## 5. Blast radius / implementation notes

**Reassuring:** decompose-on-ingest and re-wrap both operate only on encrypted bytes + non-secret metadata. No server-side plaintext, no server-side private keys.

**Hidden cost of Option B — shared library change.** Current decrypt path is zip-shaped end-to-end: `ResultsReader`'s constructor takes zip blob and reads `manifest.json` from inside it (`reader.ts:17,45-49`). Option B has no zip at read time, so must:

- Add **zip-free decrypt primitive** to `si-encryption`, e.g. `decryptFile(encryptedBody, iv, wrappedKeyForMyFingerprint, privateKey) → plaintext`. Guts already exist (`readFile` does `decryptKeyWithPrivateKey` + `decryptData`, `reader.ts:95-109`) — just need unwelding from zip iteration.
- Have reader **expose raw AES key** per file (today `readFile` computes it but returns only decrypted body) — **re-wrap needs that key**.
- Rewrite client hook (`use-decrypt-files.ts` / `use-encrypted-files-panel.ts`) to fetch body-from-S3 + iv/crypt-from-PG instead of unzipping.

**Shared-library change, not MA-only.**

### Card 72 — researcher key generation (prerequisite) — ✅ DONE (PR #764)

`user_public_key` schema already role-agnostic; only **gate** was enclave-scoped. Widened to include lab-org users.

**What shipped:**

- New predicate `orgNeedsKey(org)` in `src/lib/types.ts` = `isEnclaveOrg(org) || isLabOrg(org)`. One named concept, four call-sites — chosen over inlining `|| isLabOrg` (drift risk) and over coupling to reviewer-only concept (`usersReviewerOrgIds` stays enclave-only for approve/reject/review).
- Four gates flipped `isEnclaveOrg` → `orgNeedsKey`:
    - `src/lib/permissions.ts:67` — `if (orgs.some(orgNeedsKey))` permits view/update `ReviewerKey`
    - `src/components/require-reviewer-key.tsx:17` — redirect guard
    - `src/server/actions/user.actions.ts:17` — sign-in redirect
    - `src/app/account/invitation/[inviteId]/create-account.action.ts:155` — invite `needsReviewerKey`
- Names kept (`ReviewerKey` / `require-reviewer-key` / `set/updateReviewerPublicKeyAction`) — rename still out of scope.
- Researcher now: generates keypair client-side at `/account/keys`, downloads PEM (server never stores private key), public key + fingerprint → `userPublicKey`. Reuses reviewer path entirely; zero new storage code.

**Test fallout fixed (same PR):**

- `user-keys.actions.test.ts` — flipped stale "lab user `cannot view ReviewerKey`" assertion to assert access.
- `create-account.action.test.ts` — lab "needsReviewerKey true" case must seed user in **lab** org; `insertTestUser` auto-creates key only for **enclave**-org users (`tests/unit.helpers.tsx:215`), so enclave-seeded user already had key and broke assertion.
- e2e seed `src/database/seeds/1743608138837_test_users.ts` — seed placeholder `userPublicKey` for all test users. `RequireReviewerKey` now gates lab researchers too; key-less seeded users were redirected off dashboard, detaching `new-study` button mid-click → all study-flow specs timed out.
- Unrelated pre-existing lint warning fixed to unblock CI: `studyId` added to `useEffect` dep array in `src/hooks/use-workspace-launcher.tsx:122`.

### Card 71 — Option B steps

0. ✅ **Migration** (MA): extend `study_job_file` (`iv` text, `bytes` integer — both nullable; NO blob_location, redundant with `path`) + new `study_job_file_key(study_job_file_id, fingerprint, crypt, created_at)` UNIQUE(study_job_file_id, fingerprint). `1780000000000_study_job_file_keys.ts`. Types hand-stubbed in `src/database/types.ts` (CI regenerates — local DB/docker down).
   0b. ✅ **si-encryption primitives** (encryption repo): added zip-free `job-results/crypto.ts` (`unwrapAesKey` exposes raw AES bytes, `wrapAesKey` re-wrap, `decryptFileBody`, `decryptFile`) + `job-results/decompose.ts` (`decomposeResultsZip`). Reader/writer refactored to call primitives (no behavior change). 9/9 tests incl. re-wrap round-trip. **Needs push + MA `package.json` hash bump to consume.** (currently local `link:../encryption` override in `pnpm-workspace.yaml`.)
1. ✅ **Ingest** (`storage.ts`): `storeDecomposedEncryptedFiles(info, file, fileType, subdir)` — `decomposeResultsZip` → per-file S3 bodies + `study_job_file`(+iv,bytes) + `study_job_file_key`(DO boxes) rows, one txn. **Results AND logs decomposed** (logs share ResultsWriter format; `results/encrypted/` vs `results/encrypted-logs/`). `storeStudyEncryptedResultsFiles` + `storeStudyEncryptedLogFile` both delegate. Route + `encrypt-and-store-log.ts` callers unchanged (same signatures).
2. ✅ **Lab-pubkey query** `getLabPublicKeysForJob(jobId)` keyed on `study.submittedByOrgId` (queries.ts).
3. ✅ **Decrypt/read path:** `fetchEncryptedJobFilesAction` → per-file shape `{studyJobFileId, fileType, path, iv, crypt(=my box), encryptedBody}` (resolves session fingerprint via `getReviewerPublicKey`, joins `study_job_file_key`). `getStudyJobInfo`/`latestJobForStudyQuery` selects gained `iv`/`bytes`/`id`. `use-decrypt-files` uses `decryptFile`, drops `ResultsReader`, carries `rawAesKey`+`sourceId` on `JobFileInfo`. `use-encrypted-files-panel` rewritten to per-file/option-(a) model (approved=has researcher box via new `fetchSharedFileIdsAction`/`getSharedFileIdsForJob`; one row per `job.files` entry).
4. ✅ **Approve re-wrap:** `approveStudyJobFilesAction` now takes `sharedFiles:[{studyJobFileId, boxes:[{fingerprint,crypt}]}]`, inserts `study_job_file_key` (idempotent `onConflict doNothing`), server-validates fingerprints ∈ lab keys, no plaintext write. `job-review-buttons` fetches lab pubkeys (`fetchLabPublicKeysAction`) + `wrapAesKey` client-side per selected file. **Server never receives `rawAesKey`.** Old `fetchApprovedJobFilesAction` removed.
5. ✅ **Researcher view:** `components/job-results.tsx` (rendered in `study/[studyId]/view/`) now fetches encrypted files + prompts for the researcher's key + decrypts (same `useDecryptFiles` path) instead of reading plaintext APPROVED-\* files.

**Source compiles clean (`tsc`).** REMAINING:

- **Tests** (~15 files): mocks still use the old `EncryptedJobFile` `{blob, metadata}` shape + `fetchApprovedJobFilesAction`; test `job.files` mocks need `id`/`bytes`. New unit tests for ingest decompose, re-wrap approve, shared-file signal, researcher decrypt view.
- **Tangential cleanup:** `study.actions.ts:320` still writes plaintext via `storeApprovedJobFile` in the _proposal/code approval_ path (pre-existing "delete me" TODO). Separate from results encryption; evaluate whether it ever carries result files before removing. `storeApprovedJobFile` now used ONLY there.
- **Cross-repo:** push encryption changes, bump MA `package.json` hash, remove `link:../encryption` override.

## 10. Approval-signal model change (discovered while rewriting panel) — NEEDS DECISION

Today "approved" is encoded by the existence of an `APPROVED-RESULT` plaintext `study_job_file` row (written by `storeApprovedJobFile`). Option B (§4.5) **deletes that write**, and the new approve only inserts **researcher key boxes**. ⇒ **No `APPROVED-*` rows are created anymore.** Consequences:

- `fetchApprovedJobFilesAction` (filters `APPROVED-RESULT`) returns empty → dead.
- Panel `use-encrypted-files-panel` state model (locked / decrypted / **approved** / not-shared) loses its "approved" + "not-shared" signal.
- There is no plaintext approved copy to view — researcher & post-approval DO both **decrypt the encrypted body** via the same path.

**This forces §6 option (a):** "file has a researcher PO box" = "approved & shared." No new `approved` column. Panel must derive approved/withheld from `study_job_file_key` rows whose fingerprint ∈ lab-org fingerprints (a new query). Per-file selection (already present) drives which files get boxes. **Decision-independent of per-file-vs-all** (boxes are per-file regardless).

Remaining UI plane to build on this model: panel rewrite (iterate per-file `job.files` rows, approved=has-researcher-box), approve action rewrite (insert boxes, no plaintext), approved-file viewing (decrypt, no plaintext copy), lab-pubkey fetch action for client wrap.

---

## 6. Per-file approve/reject (confirmed from code)

Today's behavior **asymmetric**:

- **Approve = per-file subset.** Checkbox per result file; all auto-selected on decrypt, reviewer can uncheck (`use-encrypted-files-panel.ts:39,85-86,94-101`). Action takes chosen subset: `approveStudyJobFilesAction.params({ jobFiles: z.array(...) })` (`study-job.actions.ts:12-45`); button passes `jobFiles: decryptedResults` (`job-review-buttons.tsx:45`).
- **Reject = whole job.** `rejectStudyJobFilesAction` takes no file list — flips job to `FILES-REJECTED` (`study-job.actions.ts:47-70`).

**Important catch:** **no per-file approval column.** Approval tracked only at **job level** (`jobStatusChange.status`). "This file is approved" encoded _implicitly_ today by existence of plaintext `APPROVED-*` copy — which Option B (§4.5) **deletes**. So if per-file approve kept, approval state needs new home:

- **(a)** Researcher `job_file_key` rows _are_ the signal — re-wrap only approved files; "has researcher PO box" = "approved & shared." No new column. (Recommended — rows already per-file and already being inserted.)
- **(b)** Explicit `approved` flag/status on `job_file`. Cleaner/queryable, decouples "approved" from "shared," but adds column.

If product chooses **all-or-nothing** approve/reject, existing job-level status suffices, re-wrap covers all files, no per-file state needed.

> **Open product decision (Phil):** support per-file approve/reject, or approve/reject whole artifact set together? Decides whether (a)/(b) needed. Re-wrap must only ever cover **approved** files — rejected outputs must never get researcher PO boxes.
>
> **NON-BLOCKING for build.** Per-file is the superset: `approveStudyJobFilesAction` already takes a `jobFiles` subset today, so building for per-file matches current behavior; all-or-nothing falls out as "pass all files". Same re-wrap plumbing either way. Only option (b)'s explicit `approved` column is decision-dependent, and that's a cheap **additive** migration later. Everything upstream of approve (schema core, ingest/DO boxes, si-encryption primitive, lab-pubkey query, decrypt rewrite, researcher view) is fully decision-independent. → Build the spine now; defer only approve input-set semantics.

---

## 7. The cards (this work = 72 → 71 only)

- ✅ **Card 72 — researcher key generation (prerequisite for 71).** DONE — PR #764. Gate widened to lab orgs via `orgNeedsKey`; names kept.
- ⬜ **Card 71 — enable encryption for researchers.** NOT STARTED (next session). Decompose on ingest (Option B); re-wrap approved files at approve; remove plaintext; researcher decrypts client-side.
- ⛔ **Card 73 — key re-generation flow.** Out of scope.
- ⛔ **Card 74 — user-led re-encryption / recovery.** Out of scope.

---

## 8. Open questions

1. **Per-file vs all-together approve/reject** (§6) — **NOTE FOR PHIL: finalize with team/PMs.** Should reviewers approve/reject result files individually (per-file subset, as approve works today) or approve/reject whole artifact set together? One open decision affecting implementation: per-file requires new home for approval state (§6 a/b) since Option B removes implicit plaintext-copy signal; all-together needs none. Re-wrap must only ever cover **approved** files.

**Out of scope (recorded so not lost; UX/product decide later):**

- Renaming "Reviewer key" → role-neutral.
- Forced regeneration, key-loss responsibility, UX regeneration/access-split questions.
- Legacy/beta data handling, concurrent-study key association.

---

## 9. Key file references

**TOA** — `src/app/api/job/encrypt-results.ts` (encryption), `src/app/management-app-requests.ts` (fetches org public keys).

**MA**

- `src/app/api/job/[jobId]/results/route.ts` — **ingest point** (decompose here)
- `src/app/api/job/[jobId]/keys/route.ts` — public-keys endpoint
- `src/server/storage.ts` — `storeStudyEncryptedResultsFile` (zip today), `storeApprovedJobFile` (plaintext — to remove)
- `src/server/actions/study-job.actions.ts` — `approve/rejectStudyJobFilesAction`; server-side `ResultsReader.listFiles` precedent (:72-76)
- `src/server/db/queries.ts` — `getOrgIdForJobId` (enclave org), `getOrgPublicKeys` (INNER JOIN = has-key filter); **needs new lab-org query keyed on `submittedByOrgId`**
- `src/server/actions/user-keys.actions.ts` — public-key write path (role-agnostic)
- `src/lib/permissions.ts:67-70` — key-gen gate (enclave-only today)
- `src/components/require-reviewer-key.tsx`, `src/app/account/invitation/[inviteId]/create-account.action.ts:155`, `src/server/actions/user.actions.ts` — key-gen onboarding gates
- `src/hooks/use-decrypt-files.ts`, `src/hooks/use-encrypted-files-panel.ts`, `src/components/encrypted-files-panel.tsx` — client decrypt + per-file selection
- review views: `src/app/[orgSlug]/study/[studyId]/review/...`; researcher view: `.../study/[studyId]/view/...`

**si-encryption** — `job-results/writer.ts` (envelope encryption), `job-results/reader.ts` (decryption — needs zip-free primitive + expose AES key), `job-results/types.ts`, `util/keypair.ts`.

---

## 11. CHOSEN DESIGN — re-encrypt at approve (Card 71)

**Zero encryption-lib changes. No schema changes.** Reuses existing `ResultsWriter`/`ResultsReader`.

**Unchanged:** TOA ingest (stores `encrypted-results.zip` as-is), the DO **review** read path (`fetchEncryptedJobFilesAction` + `use-decrypt-files` + panel decrypt of the original zip with the reviewer key). Card 72 key-gen (researchers already generate keys).

**Changes — the approve write + approved-file viewing become encrypted:**

1. **Approve (client, `job-review-buttons`):** the DO browser already holds the decrypted plaintext from review. For each selected approved file it re-encrypts with the **existing `ResultsWriter([...reviewerKeys, ...researcherKeys])`** → an encrypted zip, and sends those to the server. **Plaintext never leaves the browser** (improvement over today, where approve POSTs plaintext).
    - Recipients = enclave org keys (reviewers, so DO can still view post-approval) + lab org keys (researchers). New `fetchResultsRecipientKeysAction({jobId})`.
2. **Approve (server, `approveStudyJobFilesAction`):** stores the re-encrypted zips via `storeApprovedJobFile` (now ciphertext, not plaintext). Sets `FILES-APPROVED` + `reviewerId`. No plaintext write.
    - **Revocation note (future / Card 74):** re-encrypt cannot cleanly _revoke_ a recipient who has left the lab (they may have decrypted already, and the box model is needed for true per-recipient removal). A code comment flags this at the approve site. Out of scope now.
3. **Approved viewing (`fetchApprovedJobFilesAction` → blob + metadata; researcher `components/job-results.tsx` + DO post-approval):** returns the encrypted approved zips; the client decrypts with the viewer's key via the **same** `use-decrypt-files` path. Researchers decrypt with their key; reviewers with theirs (both are recipients).

**Kept from the reverted build:** `getLabPublicKeysForJob(jobId)` query (lab keys keyed on `study.submittedByOrgId`) — re-added; needed for recipient assembly.

**Per-file / all-or-nothing (§6):** unaffected — re-encrypt only the selected files. Approval signal stays "APPROVED-\* row exists" (unchanged from today), just encrypted content.

### Status (verified)

- **Both** results-approve paths re-encrypt now (plaintext fully removed): `approveStudyJobFilesAction` (JobReviewButtons) **and** `approveStudyProposalAction`→`approveJobCode` (StudyReviewButtons / redesign). Shared client helper `src/lib/re-encrypt-results.ts`.
- `tsc` 0 errors, eslint clean.
- Unit tests **run in the `mgmnt-app` docker container** (host can't reach pg; port not published). Green: `encrypted-files-panel`, `study-job.actions`, `study-results`, `study-review-buttons`, `study.actions`, `study-results-redesign`. Run one-file-at-a-time with `NODE_OPTIONS=--max-old-space-size=4096` — running several suites together OOMs the container (exit 137).
- Behavioral test change: approved files now require decryption to view, so panel/study-results tests assert approved **rows by name** (decrypt covered by the dedicated decrypt tests) rather than plaintext download links.
- Revocation limitation (Card 74) noted in code at `approveStudyJobFilesAction` + `approveJobCode`.

- **Round-trip test added:** `src/server/actions/results-reencryption.test.ts` — real crypto, no mocks. Enclave reviewer (test PEM key) + lab researcher (distinct generated key) on a cross-org study; calls the real `reEncryptApprovedFiles` and asserts both the researcher's own key AND the reviewer's key decrypt the re-encrypted output back to plaintext. (Gotcha: pass `researcherId` to `insertTestStudyJobData` so it doesn't seed a fake-key enclave user that breaks `ResultsWriter`.)

Cross-repo: nothing — encryption lib untouched.
