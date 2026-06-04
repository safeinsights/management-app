# Results Encryption for Researchers — Design Notes

> Working synthesis from grilling session against codebase (management-app + trusted-output-app).
> Status: **draft for review.** Locked decisions marked ✅; open items in §8.
> **Scope: Card 72 (prerequisite) → Card 71 only.** Happy path only. Cards 73/74 (regeneration, recovery) explicitly out of scope.
> **Progress: Card 72 DONE (PR #764). Card 71 not started — next session.**

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

**Proposed schema (per file — zip can hold many files, do NOT model "zip = one row"):**

```
job_file      (id, study_job_id, path, bytes, iv, blob_location)   -- one row per file; IV lives here in Option B
job_file_key  (job_file_id, fingerprint, crypt)                    -- one row per recipient-per-file = a PO box
                UNIQUE(job_file_id, fingerprint)
```

**Read path (DO and researcher, identical):** fetch encrypted body from S3 + `iv` and row matching _my_ fingerprint from `job_file_key` → decrypt client-side. `SELECT crypt FROM job_file_key WHERE fingerprint = ? AND job_file_id IN (...)` (one box per file).

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

1. **Ingest** (`src/app/api/job/[jobId]/results/route.ts`, ~line 52, currently calls `storeStudyEncryptedResultsFile` → `results/encrypted-results.zip`): replace store-zip-as-is with decompose → S3 bodies + `job_file`/`job_file_key` rows (including DO boxes), one transaction.
2. **Decrypt path:** new zip-free primitive + client-hook rewrite (body + iv + crypt-from-PG).
3. **Approve:** drop plaintext write; DO browser re-wraps approved files' AES keys for lab researchers and POSTs `job_file_key` inserts.
4. **Researcher view:** reuse DO decrypt path.

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
