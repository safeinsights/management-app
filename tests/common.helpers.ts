export const IS_CI = !!process.env.CI

// E2E timeout constants — CI runners are slower than local machines
export const E2E_TIMEOUT = IS_CI ? 30_000 : 15_000
export const E2E_TIMEOUT_LONG = IS_CI ? 60_000 : 30_000
export const E2E_EXPECT_TIMEOUT = IS_CI ? 30_000 : 5_000
