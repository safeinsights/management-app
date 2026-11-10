import { describe, expect, it } from '../../tests/unit.helpers'
import type { ScanResponse, SemgrepTestsResult, TestResponse } from './protocol.ts'
import { fitScanResponse, fitTestResponse, MAX_RESPONSE_BYTES, responseBytes } from './response-fit.ts'

describe('fitting the Lambda response limit', () => {
    const lines = (count: number) => Array.from({ length: count }, (_, i) => `  line ${i} ${'x'.repeat(1000)}`)
    const testResponse: TestResponse = {
        mode: 'test',
        outcome: 'FINDINGS-FOUND',
        log: 'Semgrep Scan: findings found\nR and Python files analyzed: 1',
        findings: [
            {
                check_id: 'secret-github-token',
                path: 'a.R',
                start: { line: 1 },
                extra: { severity: 'ERROR', message: 'secret-github-token message' },
            },
        ],
        errors: [],
        tests: {
            results: {},
            fixtest_results: {},
            config_missing_tests: [],
            config_missing_fixtests: [],
            config_with_errors: [],
        },
    }

    it('drops errors from the end when they alone are too large', () => {
        const errors = Array.from({ length: 6000 }, (_, i) => ({
            type: 'Syntax error',
            path: `f${i}.R`,
            message: 'x'.repeat(1000),
        }))
        const response = fitTestResponse({ ...testResponse, errors })

        expect(response.errorsOmitted).toBeGreaterThan(0)
        expect(response.errors.length + response.errorsOmitted!).toBe(6000)
        expect(response.errors[0].path).toBe('f0.R')
        expect(response).toMatchObject({ log: testResponse.log, tests: testResponse.tests })
        expect(responseBytes(response)).toBeLessThanOrEqual(MAX_RESPONSE_BYTES)
    })

    it('drops the fixture test results, but keeps the log, when they alone are too large', () => {
        const checks = Object.fromEntries(
            Array.from({ length: 6000 }, (_, i) => [
                `rule-${i}-${'x'.repeat(1000)}`,
                { passed: true, matches: {}, errors: [] },
            ]),
        )
        const tests: SemgrepTestsResult = { ...testResponse.tests!, results: { 'rules/a.yaml': { checks } } }
        const response = fitTestResponse({ ...testResponse, tests })

        expect(response).toMatchObject({ tests: null, testsError: 'too-large', log: testResponse.log })
        expect(response.logTruncated).toBeUndefined()
        expect(responseBytes(response)).toBeLessThanOrEqual(MAX_RESPONSE_BYTES)
    })

    it('shortens a log that alone is too large and keeps its status line', () => {
        const log = ['Semgrep Scan: findings found', ...lines(6000)].join('\n')
        const response = fitTestResponse({ ...testResponse, log })

        const kept = response.log.split('\n')
        expect(kept[0]).toBe('Semgrep Scan: findings found')
        expect(kept.at(-1)).toBe('(log truncated to fit the response limit)')
        expect(kept.length).toBeGreaterThan(2)
        expect(response).toMatchObject({ logTruncated: true, tests: testResponse.tests })
        expect(responseBytes(response)).toBeLessThanOrEqual(MAX_RESPONSE_BYTES)
    })

    it('shortens the scan log once the report is left out and the log alone is too large', () => {
        const scan: ScanResponse = {
            mode: 'scan',
            rulesetVersion: 'v1',
            outcome: 'FINDINGS-FOUND',
            log: ['Semgrep Scan: findings found', ...lines(6000)].join('\n'),
            semgrepJson: 'x'.repeat(1000),
        }
        const response = fitScanResponse(scan)

        expect(response).toMatchObject({ semgrepJson: null, semgrepJsonOmitted: 'too-large', logTruncated: true })
        expect(response.log.split('\n')[0]).toBe('Semgrep Scan: findings found')
        expect(responseBytes(response)).toBeLessThanOrEqual(MAX_RESPONSE_BYTES)
    })
})
