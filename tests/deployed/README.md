# Deployed-environment e2e suite

The hermetic suite (`pnpm test:e2e`) runs on every PR against a local build with a faked Clerk and
simulated AWS. This suite runs against a **real deployment**: real Clerk (MFA included), the real
S3 bucket, CodeBuild scanner and containerizer, Coder, the editor service, the enclave and Mailgun.

```bash
E2E_TARGET=qa pnpm test:deployed --project=smoke       # Dev/QA, the fast checks (a few minutes)
E2E_TARGET=pr123 pnpm test:deployed --project=smoke    # a PR preview
E2E_TARGET=qa pnpm test:deployed --project=full        # the full lifecycle, waits for the real enclave
bin/e2e-deployed --target staging --project smoke      # the wrapper Jenkins uses (preflight + exit codes)
```

Reports land in `test-results/deployed/` (`junit.xml`, traces and videos on failure) and the HTML report in
`test-results/deployed-html/` (`pnpm test:deployed:report`).

## Credentials

Create `.env.deployed` (gitignored) with the **same variable names qa-review uses**, so one file
serves both tools. Per role (`ADMIN`, `RESEARCHER`, `REVIEWER`) and environment (`QA`, `STAGING`,
`PRODUCTION`, `DEMO`; PR previews use `QA`):

```
QA_BASE_URL=https://app.qa.safeinsights.org
RESEARCHER_EMAIL_QA=qa-review+researcher@safeinsights.org
RESEARCHER_PASSWORD_QA=...
RESEARCHER_MFA_CODE_QA=424242          # Clerk test-mode fixed code, or
RESEARCHER_MFA_SEED_QA=JBSW...         # a base32 TOTP seed (wins when both are set)
RESEARCHER_RESULTS_PRIVATE_KEY_QA="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

Someone with a qa-review keyring identity can export them: `qar get-secret --name REVIEWER_PASSWORD_QA`.
Without credentials, the anonymous smoke checks still run and everything that signs in is skipped
with the missing variable names.

The accounts must already hold a security key (`PATCH /api/qa/users/<email>` with `publicKey`, or
`qar fix-account`) and a second factor; the setup project fails with an actionable message otherwise.

## Targets

| `E2E_TARGET`         | Base URL                            | Accounts                | Enclave                           | Editor websocket | Mutating smoke checks          |
| -------------------- | ----------------------------------- | ----------------------- | --------------------------------- | ---------------- | ------------------------------ |
| `qa` (Dev)           | `QA_BASE_URL`                       | `_QA`                   | yes                               | yes              | yes                            |
| `pr<N>`              | `https://pr<N>.qa.safeinsights.org` | `_QA`                   | no (simulated through the QA API) | no               | yes                            |
| `staging`            | `STAGING_BASE_URL`                  | `_STAGING`              | yes                               | yes              | yes                            |
| `production`, `demo` | `..._BASE_URL`                      | `_PRODUCTION` / `_DEMO` | no runs                           | yes              | only with `E2E_SMOKE_MUTATE=1` |

`E2E_EXPECTED_RELEASE` (a short SHA or tag) makes the about-page check assert the deployed build.
`E2E_LAB_SLUG` / `E2E_DATA_PARTNER_NAME` pick the lab and Data Partner the writes go through
(defaults `openstax-lab` / `openstax`).

## Rules

- `retries: 0` and one worker: three shared accounts, one enclave, gates that are per account.
- No inline timeouts: every wait is a constant in `tests/deployed/config.ts`
  (`tests/no-inline-deployed-timeouts.mjs` enforces it). Tune them from measured runs.
- Every study a test creates goes through the `studyTracker` fixture, which deletes it through the
  QA API; `global.teardown.ts` deletes what a crashed test left in `test-results/deployed/run-manifest.json`.
- Page flows come from `tests/flows/*` and are shared with the hermetic suite; nothing here imports
  `tests/e2e.helpers.ts` (it carries the fake Clerk) or `tests/e2e.seed.ts` (it needs the database).
