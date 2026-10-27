export const IS_CI = !!process.env.CI

// CI runners are slower than local machines.
export const E2E_TIMEOUT = IS_CI ? 30_000 : 15_000
export const E2E_TIMEOUT_LONG = IS_CI ? 60_000 : 30_000
export const E2E_EXPECT_TIMEOUT = IS_CI ? 30_000 : 5_000

// Which environment the suite targets: 'local' is the hermetic stack (fake Clerk, port 4100). The
// deployed tier sets a target name (qa, staging, pr123) so saved sessions are kept apart per target.
export const E2E_TARGET = process.env.E2E_TARGET ?? 'local'

// Bearer the CodeBuild webhooks (/api/services/*) verify; bin/app-test and CI give the app the same default.
export const E2E_WEBHOOK_SECRET = process.env.CODEBUILD_WEBHOOK_SECRET ?? 'e2e-webhook-secret'

// The fake Clerk's verifyToken resolves any bearer to the SI admin, so /api/qa/* needs only a placeholder.
export const E2E_QA_BEARER = 'e2e-fake-qa-token'
