import { RuleTester } from 'eslint'
import typescriptEslint from 'typescript-eslint'
import { describe, it } from 'vitest'
import noInlineDeployedTimeouts from './no-inline-deployed-timeouts.mjs'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', parser: typescriptEslint.parser },
})

ruleTester.run('noInlineDeployedTimeouts', noInlineDeployedTimeouts, {
    valid: [
        'await expect(locator).toBeVisible({ timeout: ENCLAVE_RUN_TIMEOUT })',
        'await expect(async () => {}).toPass({ timeout: CODEBUILD_SCAN_TIMEOUT, intervals: [POLL_INTERVAL] })',
        'test.setTimeout(ENCLAVE_RUN_TIMEOUT + STAGE_TEST_TIMEOUT)',
        'await locator.waitFor()',
        'const config = { retries: 0 }',
        'setTimeout(resolve, delay)',
    ],
    invalid: [
        { code: 'await expect(locator).toBeVisible({ timeout: 30000 })', errors: [{ messageId: 'literalTimeout' }] },
        { code: 'await expect(fn).toPass({ timeout: 300000 })', errors: [{ messageId: 'literalTimeout' }] },
        { code: 'test.setTimeout(60_000)', errors: [{ messageId: 'literalTimeout' }] },
        { code: 'await page.waitForTimeout(500)', errors: [{ messageId: 'sleep' }] },
        { code: 'defineConfig({ timeout: 300000 })', errors: [{ messageId: 'literalTimeout' }] },
    ],
})
