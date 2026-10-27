# End-to-end test architecture

Two Playwright suites prove the management app works on the happy path. They share the page flows
and the HTTP clients under `tests/flows/` and `tests/api/`, and differ in what they run against.

| Tier                       | Config                          | Runs against                                                                                | When                                                                | Specs                                   |
| -------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------- |
| Hermetic (`test:e2e`)      | `playwright.config.ts`          | A local build with the Clerk fake, SeaweedFS for S3, simulated CodeBuild, in-process jobs   | Every PR (GitHub Actions `e2e`), every local change                 | `tests/*.spec.ts`                       |
| Deployed (`test:deployed`) | `playwright.deployed.config.ts` | A real environment: real Clerk and MFA, S3, scanner, containerizer, Coder, enclave, Mailgun | After a deploy (GitHub Actions or CodePipeline), nightly, on demand | `tests/deployed/{smoke,full}/*.spec.ts` |

## Layout

```
tests/
  flows/        page-flow helpers shared by both tiers: plain async functions taking `page`
                (no database, no process.env, no child_process; eslint enforces the zone)
  api/          HTTP clients on Playwright's `request`: the enclave job API (RS256 JWT + si-encryption),
                the CodeBuild webhooks, the QA API
  e2e.seed.ts   database seeds for the hermetic tier only
  e2e.helpers.ts, common.helpers.ts, global.setup.ts   hermetic fixtures, constants, storage states
  *.spec.ts     hermetic specs (one live-driven test per UI surface)
  deployed/     config (every timeout constant, target resolution), env (qa-review's account
                variables), totp, auth (real Clerk sign-in), fixtures, mail.tm, sign-up, lifecycle
                helpers, smoke/ and full/ specs, README
  e2e-coverage.ts, e2e-coverage.exceptions.ts   the route coverage map (docs/e2e-coverage.md)
  no-inline-deployed-timeouts.mjs               the lint rule behind "no inline timeouts" (deployed tier)
bin/app-test, bin/ci-server, bin/test-e2e-up    the hermetic harness
bin/e2e-deployed                                the deployed wrapper CI and laptops use
.github/workflows/e2e-deployed.yml              on demand, nightly, and on a repository_dispatch after a deploy
buildspec.e2e-deployed.yml                      the same run as a CodePipeline test action
```

## Rules both tiers keep

- `retries: 0`. A test that passes only on retry is a bug; the fix is the right wait, never a retry.
- No inline timeouts and no `waitForTimeout`: hermetic constants live in `tests/common.helpers.ts`,
  deployed ones in `tests/deployed/config.ts` (a custom ESLint rule flags literals).
- Every study a test creates carries a unique title (`studyFeatures.uniqueTitle` locally, a run
  stamp on deployments) and is deleted afterwards (the QA API on deployments).
- One UI surface is driven live by exactly one test; a seeded or API-driven state is used elsewhere.
- Global legal documents are never published inside a spec; the `legal` role belongs to one spec.
- Locators are roles and labels; `data-testid` only where the hermetic specs already use one.

## Hermetic tier

`pnpm test:e2e:up` brings up Postgres and SeaweedFS, migrates the test database and runs the suite;
`playwright.config.ts` builds and serves the app itself (`bin/app-test`). The Clerk fake
(`src/lib/clerk-fake`) turns the `__e2e_role` cookie into a session, so every role is a storage-state
file written by `tests/global.setup.ts`. `SIMULATE_CODE_BUILD` keeps approvals off AWS, and the
webhook specs sign with `CODEBUILD_WEBHOOK_SECRET`. The enclave side of the job API is exercised
in-process (`tests/api/enclave-client.ts` signs with `tests/support/private_key.pem`, which every
fixture user also holds as their public key, so the decrypt flows work on both sides).

`docs/e2e-coverage.md` maps every route in `src/lib/routes/definitions.ts` and every
`src/app/api/**` route to the test that drives it; `pnpm run checks` fails when a route has neither
a test nor an entry in `tests/e2e-coverage.exceptions.ts`.

Not yet covered here: the collaborative editor itself. The default run sets `SINGLE_USER_EDITING`,
so the editor service never starts. Running `services/editor` locally against the Clerk fake needs
the service to accept a fake token when `E2E_FAKE_CLERK` is set, which is a product change
awaiting a decision; the deployed tier covers collaboration against the real service instead.

## Deployed tier

`tests/deployed/README.md` is the operator's guide: credentials (qa-review's variable names in
`.env.deployed`; `tests/deployed/env.deployed.sample` lists them), targets (`qa`, `staging`,
`production`, `demo`, `pr<N>`), what each project does, how CI runs it and the rules.

The `smoke` project is safe on every environment and takes a few minutes: the app shell and the
deployed release, CloudFront's asset and `_rsc` paths, each role's session, a Server Action at the
live host, the S3 CORS preflight, Coder's health and OIDC callback, the editor websocket, the QA
API's guards and `/legal`. The `full` project creates studies: one R study through every component,
with the real enclave on environments that have one and the QA API standing in on PR previews; the
same for Python up to the containerizer; deliberately insecure code the scanner must fail; the IDE
launch through Coder's OIDC; two sessions co-editing a draft; an invitation through Mailgun and a
complete sign-up; a Study Agreement published and acknowledged; the job API's key check.

Each lifecycle stage is its own serial test, so a failure names the component and its budget is
one named constant. Everything created is tracked in `test-results/deployed/run-manifest.json` and
deleted by the test that ends the chain or by `global.teardown.ts`.

## Where things stand (2026-10-27)

- Hermetic: 100 tests, three consecutive green runs at `retries: 0`, every route covered or excepted.
- Deployed: the anonymous smoke checks pass against Dev; everything that signs in needs the shared
  accounts' credentials, which only a qa-review keyring holder can export. The account-dependent
  specs are written against the product's current copy and selectors and have been linted,
  type-checked and dry-run (every test skips cleanly without credentials) but not yet executed with
  them. Dev's `openstax` org no longer holds the committed test key (the job API answered 401), so
  `enclave-api.spec.ts` skips there with an annotation until the key is restored.
- CI: the GitHub Actions workflow needs the `E2E_DEPLOYED_ENV` repository secret, and whatever
  deploys an environment needs to send the `deployed-e2e` repository dispatch afterwards (or the
  CodePipeline gets a test action from `buildspec.e2e-deployed.yml`). Until then the nightly run
  and the on-demand run are the two ways in.
