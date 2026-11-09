export const IS_CI = !!process.env.CI

// CI runners are slower than local machines, and so is bin/docker-e2e: its Docker host shares the
// CPUs with every other stack.
const CI_TIMEOUTS = IS_CI || !!process.env.E2E_CI_TIMEOUTS
export const E2E_TIMEOUT = CI_TIMEOUTS ? 30_000 : 15_000
export const E2E_TIMEOUT_LONG = CI_TIMEOUTS ? 60_000 : 30_000
export const E2E_EXPECT_TIMEOUT = CI_TIMEOUTS ? 30_000 : 5_000
