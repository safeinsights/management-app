import { describe, expect, it } from '../../tests/unit.helpers'
import {
    gateResponseSchema,
    isRuleFile,
    rulesetManifestSchema,
    rulesetRulesPrefix,
    rulesetVersionPrefix,
    runnerRequestSchema,
} from './protocol.ts'

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

describe('rulesetVersionPrefix', () => {
    it('keeps the version inside the environment prefix', () => {
        expect(rulesetVersionPrefix('dev', 'v12')).toBe('rulesets/dev/v12/')
    })
})

describe('rulesetManifestSchema', () => {
    const manifest = {
        schemaVersion: 1,
        version: 'v3',
        env: 'staging',
        createdAt: '2026-11-20T10:00:00.000Z',
        author: { userId: '0195f1a4-6b52-7a3c-9e21-3f4d5c6b7a80', name: 'Ada Admin' },
        changeNote: 'tighten the secrets rule',
        source: { env: 'dev', version: 'v5' },
        files: ['rules/secrets.yaml', 'rules/nested/r.yml', 'tests/secrets.r', 'tests/corpus/a/analysis.R'],
    }
    const parses = (overrides: Record<string, unknown>) =>
        rulesetManifestSchema.safeParse({ ...manifest, ...overrides }).success

    it('accepts a manifest, also without a source and with no user id', () => {
        expect(parses({})).toBe(true)
        expect(parses({ source: null, author: { userId: null, name: 'seed' } })).toBe(true)
    })

    it.each(['v0', 'v01', '1', 'v1.2', 'v1234567890'])('rejects the version %j', (version) => {
        expect(parses({ version })).toBe(false)
        expect(parses({ source: { env: 'dev', version } })).toBe(false)
    })

    it.each([
        ['a rule path Semgrep would not load', 'rules/secrets.test.yaml'],
        ['a path outside rules/ and tests/', 'docs/readme.md'],
        ['tests/ alone', 'tests/'],
        ['a .. segment', 'tests/../rules/x.yaml'],
        ['an empty segment', 'tests//a.r'],
    ])('rejects %s', (_, path) => {
        expect(parses({ files: ['rules/secrets.yaml', path] })).toBe(false)
    })

    it('rejects duplicate paths, no rule file, an empty author name and an unknown environment', () => {
        expect(parses({ files: ['rules/secrets.yaml', 'rules/secrets.yaml'] })).toBe(false)
        expect(parses({ files: ['tests/secrets.r'] })).toBe(false)
        expect(parses({ author: { userId: null, name: '' } })).toBe(false)
        expect(parses({ env: 'qa' })).toBe(false)
    })
})

describe('gate protocol', () => {
    it('parses the gate request arm and refuses a version that is not v<N>', () => {
        expect(runnerRequestSchema.safeParse({ mode: 'gate', rulesetVersion: 'v7' }).success).toBe(true)
        expect(runnerRequestSchema.safeParse({ mode: 'gate', rulesetVersion: 'test-1' }).success).toBe(false)
    })

    it('accepts a passed and a failed gate response', () => {
        const check = (name: string, passed: boolean) => ({ name, passed, failures: passed ? [] : ['x'] })
        expect(
            gateResponseSchema.safeParse({
                mode: 'gate',
                rulesetVersion: 'v1',
                passed: true,
                checks: ['integrity', 'rules', 'fixtures', 'coverage'].map((name) => check(name, true)),
            }).success,
        ).toBe(true)
        expect(
            gateResponseSchema.safeParse({
                mode: 'gate',
                rulesetVersion: 'v1',
                passed: false,
                checks: [
                    { ...check('integrity', false), failuresOmitted: 3 },
                    { name: 'rules', passed: false, skipped: true, failures: [] },
                ],
            }).success,
        ).toBe(true)
        expect(
            gateResponseSchema.safeParse({
                mode: 'gate',
                rulesetVersion: 'v1',
                passed: false,
                checks: [],
                error: 'manifest-invalid',
            }).success,
        ).toBe(true)
    })
})
