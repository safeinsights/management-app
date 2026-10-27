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

Create `.env.deployed` (gitignored; `tests/deployed/env.deployed.sample` lists every name) with the
**same variable names qa-review uses**, so one file serves both tools. Per role (`ADMIN`, `RESEARCHER`, `REVIEWER`) and environment (`QA`, `STAGING`,
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

## The full project

`tests/deployed/full/` drives one study through every component, one serial test per stage so a
failure names the component: `lifecycle-r.spec.ts` (propose, approve, upload, scanner, AI review,
containerizer, the real enclave run or, on a PR preview, the QA API standing in for it, decrypt and
download, share, the researcher's own decrypt, delete), `lifecycle-python.spec.ts` (the same up to the
queued image: there is no known-good Python script for the enclave's data access yet) and
`scan-findings.spec.ts` (deliberately insecure R and Python files the scanner must fail). The R script
is qa-review's known-good single-query `tests/fixtures/deployed/main.r`, which writes `results.csv`.

The other components have a spec each:

- `coder.spec.ts`: an approved study's Launch IDE provisions a Coder workspace, Coder's OIDC sends the
  researcher through Clerk's hosted sign-in, code-server renders with the starter file, and the app's
  code page lists the workspace's files. `E2E_CODER=0` leaves it out.
- `collab-editor.spec.ts` (environments with the editor service): two sessions of the researcher on
  one draft see each other's typing over `wss://<host>/ws`.
- `invite-signup.spec.ts` (`@mail`): an admin invites a disposable mail.tm address, the invitation
  arrives through Mailgun with this host's link, and a new context signs up: Clerk account,
  authenticator enrollment from the on-page secret, recovery codes, first security key. The account
  is deleted through the QA API, so its address starts with `qa-`. Needs egress to `api.mail.tm`.
- `study-agreement.spec.ts`: a study from a lab that is not a Test Lab, the SI admin publishing the
  signed agreement on `/admin/safeinsights/legal`, and both parties meeting the gate. `E2E_SLA_LAB_SLUG`
  / `E2E_SLA_LAB_NAME` name that lab (Dev: `agreements`, "Agreements Lab"); elsewhere it skips until set.
- `enclave-api.spec.ts` (`@api`): a token signed with `tests/support/private_key.pem` as the `openstax`
  org. Dev seeds that org with the committed test key, so it expects 200 there; when the key has been
  rotated (Dev answered 401 on 2026-10-27) it skips with an annotation. Staging, Production and Demo
  must answer 401.

## Jenkins

`Jenkinsfile` runs the smoke project after each PR preview and Dev deploy (`bin/e2e-deployed`).
`Jenkinsfile.deployed-e2e` is a parameterized job for everything else: the release pipeline triggers
it after a Staging or Production deploy, and QA runs it by hand against any target with any project.
Both bind the secret-file credential `mgmt-app-e2e-deployed-env` to `E2E_DEPLOYED_ENV_FILE`, which is
copied to `.env.deployed`; nothing prints the environment.

## Rules

- `retries: 0` and one worker: three shared accounts, one enclave, gates that are per account.
- No inline timeouts: every wait is a constant in `tests/deployed/config.ts`
  (`tests/no-inline-deployed-timeouts.mjs` enforces it). Tune them from measured runs.
- Every study a test creates goes through the `studyTracker` fixture, which deletes it through the
  QA API; `global.teardown.ts` deletes what a crashed test left in `test-results/deployed/run-manifest.json`.
- Page flows come from `tests/flows/*` and are shared with the hermetic suite; nothing here imports
  `tests/e2e.helpers.ts` (it carries the fake Clerk) or `tests/e2e.seed.ts` (it needs the database).
