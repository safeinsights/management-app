# Results Encryption for Researchers — Design Notes

> Working synthesis from a grilling session against the codebase (management-app + trusted-output-app).
> Status: **draft for review.** Decisions locked so far are marked ✅; open items are in §8.
> **Scope for this work: Card 72 (prerequisite) → Card 71 only.** Happy path only. Cards 73 / 74 (regeneration, recovery) are explicitly out of scope here.

---

## 1. The problem

The secure enclave's output (result files + run logs) is delivered to **DO reviewers** encrypted, but the same output is currently exposed to **researchers in plaintext**. Reviewers decrypt client-side with a private key generated at signup; researchers get an unencrypted copy.

Goal: researchers must _also_ decrypt with their own key, so output is never available in plaintext on the researcher side.

---

## 2. How the encryption works today (the "post office" analogy)

| Concept (analogy)                                                | Implementation                                                                                               | Where in code                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| **Results key** — a padlock whose one key both locks and unlocks | A random **AES-256-CBC** symmetric key, generated **per file** (+ a per-file random IV)                      | `si-encryption/job-results/writer.ts:19,22`                  |
| **Lock the results**                                             | Encrypt each file's bytes with its AES key                                                                   | `writer.ts:25`                                               |
| **A PO box for each person**                                     | The AES key is "wrapped" (encrypted) with each recipient's **RSA-OAEP-4096 public key**                      | `writer.ts:31-35,58-84`                                      |
| **The PO box number**                                            | The recipient's **fingerprint** = SHA-256 of their public key                                                | `util/keypair.ts:105-111`                                    |
| **The post office (directory of boxes)**                         | `manifest.json` — maps `fingerprint → { crypt }`, plus per-file `iv`, `path`, `bytes`                        | `writer.ts:39-44`; types in `job-results/types.ts`           |
| **Ship it**                                                      | TOA zips `manifest.json` + encrypted bodies, POSTs to MA                                                     | TOA `src/app/api/job/encrypt-results.ts`                     |
| **Open the box**                                                 | Browser fetches the zip, finds its PO box by fingerprint, unwraps the AES key with its private key, decrypts | `hooks/use-decrypt-files.ts`, `job-results/reader.ts:95-109` |

**Key types, ELI5**

- **RSA keypair (asymmetric)** — public key = a mail slot anyone can drop into; private key = the only physical key that opens the box. Mathematically bound; you can't edit one to fit the other.
- **AES key (symmetric)** — one key locks and unlocks. Fast; used for big file bodies. One per file.
- **IV (initialization vector)** — a per-file random value, **not secret**, but **required** to decrypt (AES-CBC). Must always travel with its ciphertext.
- **Fingerprint** — the nameplate on the box; SHA-256 of the public key.
- **Envelope encryption** — lock the big file once with a fast AES padlock, then put a _copy_ of that AES key into a personal RSA-locked box per recipient. The manifest is the directory of boxes.

**Where keys live**

- **Public key** → DB `user_public_key` (`public_key` bytea, `fingerprint` text, `UNIQUE(user_id)`). Schema is already **role-agnostic**.
- **Private key** → user downloads a PEM; **never stored server-side**. This is the core guarantee: _the server cannot read results._

---

## 3. The fact that reframes the work

Approve currently stores **plaintext**. `approveStudyJobFilesAction` (`src/server/actions/study-job.actions.ts:12-45`) takes the DO's already-decrypted contents and writes them to `results/approved/` via `storeApprovedJobFile`. Researchers read those plaintext files. So this project is _"stop writing the decrypted copy, and give researchers their own PO boxes instead."_

---

## 4. Architecture decisions (locked)

### ✅ 4.1 One key per user, not per role (Card 72)

A single keypair serves a person as reviewer _and_ researcher. Encryption already takes all org public keys regardless of role (`writer.ts`), so the same key works for both hats. Consequence: key handling is user-level, not role-level.

### ✅ 4.2 Re-wrap, not re-encrypt (core mechanic)

Granting a researcher access does **not** re-encrypt file bodies. The file's existing AES key is **wrapped again** for the researcher's public key → a new PO box. The ciphertext and IV never change.

- The DO's browser already holds the raw AES key (it just decrypted to review), so it wraps that key for each researcher and uploads new boxes. **The server never sees plaintext.**
- A regenerated key cannot open old boxes — that impossibility _is_ the security. (Recovery/regeneration handling = out of scope here; see §8.)

### ✅ 4.3 Option B — decompose on ingest

When MA receives TOA's zip, it **unzips once on the server** and stores the pieces separately:

- each **encrypted body** → its own S3 object
- per-file **metadata (iv, path, bytes)** + per-recipient **wrapped keys** → Postgres

The manifest is **plaintext metadata** (IVs/fingerprints/wrapped keys are not secret), and the server already parses it today with an empty key just to list files (`study-job.actions.ts:72-76`). So decompose-on-ingest needs **no private keys and touches no plaintext** — the zero-plaintext-on-server guarantee holds.

Postgres is the **single source of truth for PO boxes** (both DO and researcher). The zip is reduced to a transient ingest format; the read path no longer unzips.

**Proposed schema (per file — a zip can hold many files, so do NOT model "zip = one row"):**

```
job_file      (id, study_job_id, path, bytes, iv, blob_location)   -- one row per file; IV lives here in Option B
job_file_key  (job_file_id, fingerprint, crypt)                    -- one row per recipient-per-file = a PO box
                UNIQUE(job_file_id, fingerprint)
```

**Read path (DO and researcher, identical):** fetch encrypted body from S3 + `iv` and the row matching _my_ fingerprint from `job_file_key` → decrypt client-side. `SELECT crypt FROM job_file_key WHERE fingerprint = ? AND job_file_id IN (...)` (one box per file).

### ✅ 4.4 Re-wrap at approve, client-side (Card 71)

On **Approve**, the DO's browser:

1. Fetches the **lab's** public keys — members of `study.submittedByOrgId` who have a key.
2. Wraps each approved file's AES key (already in memory from decrypting) to each researcher public key.
3. POSTs the new PO boxes; server inserts `job_file_key` rows in one transaction (atomic, idempotent via the unique constraint).

### ✅ 4.5 Remove plaintext storage

Drop the `storeApprovedJobFile` plaintext write. Researchers read the encrypted body + their PO box and decrypt client-side, using the **same** path as reviewers.

---

## 5. Blast radius / implementation notes

**Reassuring:** decompose-on-ingest and re-wrap both operate only on encrypted bytes + non-secret metadata. No server-side plaintext, no server-side private keys.

**Hidden cost of Option B — shared library change.** The current decrypt path is zip-shaped end-to-end: `ResultsReader`'s constructor takes a zip blob and reads `manifest.json` from inside it (`reader.ts:17,45-49`). Option B has no zip at read time, so we must:

- Add a **zip-free decrypt primitive** to `si-encryption`, e.g. `decryptFile(encryptedBody, iv, wrappedKeyForMyFingerprint, privateKey) → plaintext`. The guts already exist (`readFile` does `decryptKeyWithPrivateKey` + `decryptData`, `reader.ts:95-109`) — they just need to be unwelded from zip iteration.
- Have the reader **expose the raw AES key** per file (today `readFile` computes it but only returns the decrypted body) — **re-wrap needs that key**.
- Rewrite the client hook (`use-decrypt-files.ts` / `use-encrypted-files-panel.ts`) to fetch body-from-S3 + iv/crypt-from-PG instead of unzipping.

This is a **shared-library change, not MA-only.**

### Card 72 — researcher key generation (prerequisite)

The `user_public_key` schema is already role-agnostic; only the **gate** is enclave-scoped. To include lab-org users:

- `src/app/account/invitation/[inviteId]/create-account.action.ts:155` — `org.type === 'enclave'` → include `'lab'`
- `src/components/require-reviewer-key.tsx:17` + login check in `src/server/actions/user.actions.ts` — `isEnclaveOrg` → include lab
- `src/lib/permissions.ts:67-70` — permit `ReviewerKey` for lab orgs too
- Naming: keep the existing `ReviewerKey` / `require-reviewer-key` / `set/updateReviewerPublicKeyAction` names as-is. **Renaming is out of scope for this work** — just widen the gate.

### Card 71 — Option B steps

1. **Ingest** (`src/app/api/job/[jobId]/results/route.ts`, ~line 52, currently calls `storeStudyEncryptedResultsFile` → `results/encrypted-results.zip`): replace store-zip-as-is with decompose → S3 bodies + `job_file`/`job_file_key` rows (including DO boxes), one transaction.
2. **Decrypt path:** new zip-free primitive + client-hook rewrite (body + iv + crypt-from-PG).
3. **Approve:** drop plaintext write; DO browser re-wraps approved files' AES keys for lab researchers and POSTs `job_file_key` inserts.
4. **Researcher view:** reuse the DO decrypt path.

---

## 6. Per-file approve/reject (confirmed from code)

Today's behavior is **asymmetric**:

- **Approve = per-file subset.** Checkbox per result file; all auto-selected on decrypt, reviewer can uncheck (`use-encrypted-files-panel.ts:39,85-86,94-101`). The action takes the chosen subset: `approveStudyJobFilesAction.params({ jobFiles: z.array(...) })` (`study-job.actions.ts:12-45`); button passes `jobFiles: decryptedResults` (`job-review-buttons.tsx:45`).
- **Reject = whole job.** `rejectStudyJobFilesAction` takes no file list — flips job to `FILES-REJECTED` (`study-job.actions.ts:47-70`).

**Important catch:** there is **no per-file approval column.** Approval is tracked only at the **job level** (`jobStatusChange.status`). "This file is approved" is encoded _implicitly_ today by the existence of a plaintext `APPROVED-*` copy — which Option B (§4.5) **deletes**. So if per-file approve is kept, approval state needs a new home:

- **(a)** The researcher `job_file_key` rows _are_ the signal — re-wrap only approved files; "has a researcher PO box" = "approved & shared." No new column. (Recommended — the rows are already per-file and already being inserted.)
- **(b)** An explicit `approved` flag/status on `job_file`. Cleaner/queryable, decouples "approved" from "shared," but adds a column.

If product chooses **all-or-nothing** approve/reject instead, the existing job-level status suffices, re-wrap covers all files, and no per-file state is needed.

> **Open product decision (Phil):** support per-file approve/reject, or approve/reject the whole artifact set together? This decides whether (a)/(b) is needed. Re-wrap must only ever cover **approved** files — rejected outputs must never get researcher PO boxes.

---

## 7. The cards (this work = 72 → 71 only)

- ✅ **Card 72 — researcher key generation (prerequisite for 71).** Widen the key-gen gate to lab orgs; decide naming.
- ✅ **Card 71 — enable encryption for researchers.** Decompose on ingest (Option B); re-wrap approved files at approve; remove plaintext; researcher decrypts client-side.
- ⛔ **Card 73 — key re-generation flow.** Out of scope here.
- ⛔ **Card 74 — user-led re-encryption / recovery.** Out of scope here.

---

## 8. Open questions

1. **Per-file vs all-together approve/reject** (§6) — **NOTE FOR PHIL: finalize with team/PMs.** Should reviewers approve/reject result files individually (per-file subset, as approve works today) or approve/reject the whole artifact set together? This is the one open decision that affects implementation: per-file requires a new home for approval state (§6 a/b) since Option B removes the implicit plaintext-copy signal; all-together needs none. Re-wrap must only ever cover **approved** files.

**Out of scope for this work (recorded so they aren't lost; whatever's easiest, UX/product decide later):**

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
- `src/server/db/queries.ts` — `getOrgIdForJobId` (enclave org), `getOrgPublicKeys` (INNER JOIN = has-key filter); **needs a new lab-org query keyed on `submittedByOrgId`**
- `src/server/actions/user-keys.actions.ts` — public-key write path (role-agnostic)
- `src/lib/permissions.ts:67-70` — key-gen gate (enclave-only today)
- `src/components/require-reviewer-key.tsx`, `src/app/account/invitation/[inviteId]/create-account.action.ts:155`, `src/server/actions/user.actions.ts` — key-gen onboarding gates
- `src/hooks/use-decrypt-files.ts`, `src/hooks/use-encrypted-files-panel.ts`, `src/components/encrypted-files-panel.tsx` — client decrypt + per-file selection
- review views: `src/app/[orgSlug]/study/[studyId]/review/...`; researcher view: `.../study/[studyId]/view/...`

**si-encryption** — `job-results/writer.ts` (envelope encryption), `job-results/reader.ts` (decryption — needs zip-free primitive + expose AES key), `job-results/types.ts`, `util/keypair.ts`.
