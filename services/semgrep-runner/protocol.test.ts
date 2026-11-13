import { describe, expect, it } from '../../tests/unit.helpers'
import { isRuleFile, rulesetRulesPrefix, runnerRequestSchema } from './protocol.ts'

const rule = { path: 'secrets.yaml', content: 'rules: []' }
const file = { path: 'secrets.r', content: 'x <- 1' }

function testRequest(overrides: Record<string, unknown> = {}) {
    return { mode: 'test', rules: [rule], files: [file], ...overrides }
}

describe('runnerRequestSchema', () => {
    it('accepts a test request with nested paths and a scan request', () => {
        expect(
            runnerRequestSchema.safeParse(
                testRequest({
                    files: [file, { path: 'a/b/c.py', content: '' }, { path: 'dir\\analysis.R', content: '' }],
                    rules: [rule, { ...rule, path: 'x/y.yml' }],
                }),
            ).success,
        ).toBe(true)
        expect(
            runnerRequestSchema.safeParse({
                mode: 'scan',
                submission: { bucket: 'b', prefix: 'studies/1/code' },
                rulesetVersion: 'v1.2_3',
            }).success,
        ).toBe(true)
    })

    it.each(['../x.r', '/etc/x', 'a//b.r', './a.r', 'a/../b.r', 'a\0b'])('rejects the unsafe path %j', (path) => {
        expect(runnerRequestSchema.safeParse(testRequest({ files: [{ path, content: '' }] })).success).toBe(false)
    })

    it('rejects rule files Semgrep would not load, and empty lists', () => {
        for (const path of ['rules.json', 'secrets.YAML', 'secrets.test.yaml']) {
            expect(runnerRequestSchema.safeParse(testRequest({ rules: [{ ...rule, path }] })).success).toBe(false)
        }
        expect(runnerRequestSchema.safeParse(testRequest({ rules: [] })).success).toBe(false)
        expect(runnerRequestSchema.safeParse(testRequest({ files: [] })).success).toBe(false)
    })

    // Either would silently replace one file with another before the scan.
    it('rejects a duplicate path and a path that is the folder of another', () => {
        expect(runnerRequestSchema.safeParse(testRequest({ files: [file, file] })).success).toBe(false)
        expect(
            runnerRequestSchema.safeParse(
                testRequest({
                    files: [
                        { path: 'a.R', content: '' },
                        { path: 'a.R/b.R', content: '' },
                    ],
                }),
            ).success,
        ).toBe(false)
        expect(
            runnerRequestSchema.safeParse(testRequest({ rules: [rule, { path: 'secrets.yaml/x.yaml', content: '' }] }))
                .success,
        ).toBe(false)
    })

    it('rejects an unknown mode and an unsafe ruleset version', () => {
        expect(runnerRequestSchema.safeParse({ ...testRequest(), mode: 'validate' }).success).toBe(false)
        expect(
            runnerRequestSchema.safeParse({
                mode: 'scan',
                submission: { bucket: 'b', prefix: 'p' },
                rulesetVersion: '../production/v1',
            }).success,
        ).toBe(false)
    })
})

describe('isRuleFile', () => {
    it.each(['a.yaml', 'a.yml', 'x/my.rule.yaml', 'a.tests.yaml'])('accepts %j', (file) => {
        expect(isRuleFile(file)).toBe(true)
    })

    it.each(['a.YAML', 'a.Yml', 'a.test.yaml', 'a.test.yml', 'a.fixed.yaml', 'a.fixed.test.yaml', 'a.yaml.', 'yaml'])(
        'rejects %j, as Semgrep does',
        (file) => {
            expect(isRuleFile(file)).toBe(false)
        },
    )

    // A scan would load these, but Semgrep's fixture test skips them, so they could run untested.
    it.each(['.hidden.yaml', '.dir/a.yaml', 'x/.dir/a.yaml'])('rejects the dot-name %j', (file) => {
        expect(isRuleFile(file)).toBe(false)
    })
})

describe('rulesetRulesPrefix', () => {
    it('keeps every rules bucket key inside the environment prefix', () => {
        expect(rulesetRulesPrefix('staging', 'v3')).toBe('rulesets/staging/v3/rules/')
    })
})
