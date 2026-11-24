import { describe, expect, it } from '../../tests/unit.helpers'
import {
    coverageCheck,
    evaluateFixtures,
    evaluateIntegrity,
    evaluateRules,
    gateCheck,
    gateResult,
    REGRESSION_FINDINGS,
} from './gate.ts'
import {
    GATE_FAILURE_MAX_CHARS,
    GATE_FAILURES_CAP,
    semgrepTestsResultSchema,
    type SemgrepFinding,
    type SemgrepOutput,
} from './protocol.ts'
import type { CommandResult } from './semgrep-command.ts'

const exit = (code: number, stdout = ''): CommandResult => ({ code, stdout, stderr: '', aborted: false })

const passingTests = (overrides: Record<string, unknown> = {}) =>
    semgrepTestsResultSchema.parse({
        results: {
            'rules/secrets.yaml': {
                checks: {
                    'secret-github-token': {
                        passed: true,
                        matches: { 'src/secrets.r': { expected_lines: [4], reported_lines: [4] } },
                    },
                },
            },
        },
        ...overrides,
    })

function finding(path: string, line: number, severity = 'ERROR', rule = 'r-shell-command'): SemgrepFinding {
    return { check_id: `rules.${rule}`, path, start: { line }, extra: { severity, message: 'm' } }
}

const fixture = [
    '# r-security fixture', // 1
    '# --- 1. Shell', // 2
    'system(cmd)', // 3
    '# --- 2. Eval', // 4
    'eval(parse(text = x))', // 5
    '# Legitimate research code', // 6
    'mean(x)', // 7
].join('\n')

// One finding for each regression the gate asserts, as Semgrep reports it under notebooks/ or src/.
const allRegressions = (): SemgrepFinding[] =>
    REGRESSION_FINDINGS.map(([file, line, rule]) => finding(`notebooks/${file}`, line ?? 1, 'ERROR', rule))

const coverage = (results: SemgrepFinding[], files: Record<string, string>, errors: SemgrepOutput['errors'] = []) =>
    coverageCheck({
        report: { results: [...results, ...allRegressions()], errors },
        testFiles: new Map(Object.entries(files)),
    })

const covered = [finding('src/r-security.r', 3), finding('src/r-security.r', 5)]

describe('gateCheck', () => {
    it('drops repeated failures, cuts long ones and caps the list', () => {
        const long = 'x'.repeat(GATE_FAILURE_MAX_CHARS + 50)
        const many = Array.from({ length: GATE_FAILURES_CAP + 7 }, (_, i) => `failure ${i}`)
        const check = gateCheck('rules', [long, long, ...many])

        expect(check.passed).toBe(false)
        expect(check.failures).toHaveLength(GATE_FAILURES_CAP)
        expect(check.failures[0]).toHaveLength(GATE_FAILURE_MAX_CHARS)
        expect(check.failuresOmitted).toBe(8)
        expect(gateCheck('rules', [])).toEqual({ name: 'rules', passed: true, failures: [] })
    })

    it('passes the gate only when every check passed', () => {
        expect(gateResult('v1', [gateCheck('rules', []), gateCheck('fixtures', [])]).passed).toBe(true)
        expect(gateResult('v1', [gateCheck('rules', []), gateCheck('fixtures', ['x'])]).passed).toBe(false)
    })
})

describe('evaluateIntegrity', () => {
    it('passes an exact match and names each missing and each unlisted file', () => {
        expect(evaluateIntegrity(['rules/a.yaml', 'tests/a.r'], ['tests/a.r', 'rules/a.yaml']).passed).toBe(true)
        expect(evaluateIntegrity(['rules/a.yaml', 'tests/a.r'], ['rules/a.yaml', 'tests/b.r']).failures).toEqual([
            'missing: tests/a.r',
            'not in version.json: tests/b.r',
        ])
    })
})

describe('evaluateRules', () => {
    it('passes a clean --validate run with no rule errors in the fixture test', () => {
        expect(evaluateRules(exit(0, '{"errors":[]}'), passingTests()).passed).toBe(true)
    })

    // The shape Semgrep 1.183.0 prints for a rule without a message.
    it('lists each JSON error of a failed --validate run', () => {
        const stdout = JSON.stringify({
            errors: [
                {
                    type: 'InvalidRuleSchemaError',
                    long_msg: "One of these properties is missing: 'message'",
                    short_msg: 'Invalid rule schema',
                    spans: [{ file: 'rules/secrets.yaml' }],
                },
                { type: 'Rule parse error', rule_id: 'secret-private-key', message: 'Missing required field message' },
                { type: ['PartialParsing', []], short_msg: 'partial' },
            ],
        })
        expect(evaluateRules(exit(2, stdout), passingTests()).failures).toEqual([
            "InvalidRuleSchemaError: One of these properties is missing: 'message'",
            'Rule parse error: Missing required field message',
            '["PartialParsing",[]]: partial',
        ])
    })

    // Without semgrep.dev, --validate cannot load its lint pack and exits 2 with no JSON.
    it('gives one generic failure when --validate fails without JSON errors', () => {
        expect(evaluateRules(exit(2, ''), passingTests()).failures).toEqual(['semgrep --validate failed (exit 2)'])
    })

    it('fails each rule file the fixture test could not load', () => {
        const tests = passingTests({
            config_with_errors: [{ filename: 'rules/b.yaml', error: 'bad yaml', output: '' }],
        })
        expect(evaluateRules(exit(0), tests).failures).toEqual(['rules/b.yaml: bad yaml'])
    })
})

describe('evaluateFixtures', () => {
    it('passes when every check ran and passed', () => {
        expect(evaluateFixtures(passingTests(), undefined)).toEqual({ name: 'fixtures', passed: true, failures: [] })
    })

    it('fails a failed check with its expected and reported lines', () => {
        const tests = passingTests({
            results: {
                'rules/secrets.yaml': {
                    checks: {
                        'secret-github-token': {
                            passed: false,
                            matches: { 'src/secrets.r': { expected_lines: [4, 6], reported_lines: [4] } },
                        },
                    },
                },
            },
        })
        expect(evaluateFixtures(tests, undefined).failures).toEqual([
            'rules/secrets.yaml: secret-github-token failed (expected lines 4, 6, reported 4)',
        ])
    })

    it('fails a failed autofix test, zero checks and a rule file without a test file', () => {
        expect(
            evaluateFixtures(passingTests({ fixtest_results: { 'src/a.r': { passed: false } } }), undefined).failures,
        ).toEqual(['src/a.r: autofix test failed'])
        expect(
            evaluateFixtures(passingTests({ results: {}, config_missing_tests: ['rules/a.yaml'] }), undefined).failures,
        ).toEqual(['no fixture checks ran', 'rules/a.yaml: rule file has no test file'])
    })

    it('fails when the fixture test output is unavailable', () => {
        expect(evaluateFixtures(null, 'unparseable-output').failures).toEqual([
            'fixture test output unavailable (unparseable-output)',
        ])
    })

    it('names the cause that Semgrep 1.183.0 prints on stderr when an annotation error stops the fixture test', () => {
        const stderr = [
            '  Scanning 1 file with 18 Code rules:',
            '  Scanning 1 file with 18 r rules.',
            "Found rule id mismatch - file=src/r-security.r 'ruleid' annotation with no YAML rule=set()",
            "Failing due to rule id mismatch. There is a test denoted with 'ruleid: <rule name>' where the rule name does not exist or is not expected in the test file.",
        ].join('\n')
        expect(evaluateFixtures(null, 'unparseable-output', stderr).failures).toEqual([
            'fixture test output unavailable (unparseable-output)',
            "Found rule id mismatch - file=src/r-security.r 'ruleid' annotation with no YAML rule=set()",
            "Failing due to rule id mismatch. There is a test denoted with 'ruleid: <rule name>' where the rule name does not exist or is not expected in the test file.",
        ])
    })
})

describe('coverageCheck', () => {
    it('passes when every section has a finding and legitimate code has none that gates', () => {
        const check = coverage([...covered, finding('src/r-security.r', 7, 'INFO')], { 'r-security.r': fixture })
        expect(check).toEqual({ name: 'coverage', passed: true, failures: [] })
    })

    it('fails a section without a finding', () => {
        expect(coverage([finding('src/r-security.r', 3)], { 'r-security.r': fixture }).failures).toEqual([
            'r-security.r: no finding in section 2',
        ])
    })

    it('does not count a finding on the section header line', () => {
        expect(coverage([finding('src/r-security.r', 2), covered[1]], { 'r-security.r': fixture }).failures).toEqual([
            'r-security.r: no finding in section 1',
        ])
    })

    it('fails a WARNING after the marker', () => {
        const check = coverage([...covered, finding('src/r-security.r', 7, 'WARNING', 'r-file-write')], {
            'r-security.r': fixture,
        })
        expect(check.failures).toEqual(['r-security.r:7: WARNING r-file-write fires on legitimate code'])
    })

    it('fails a gating finding on a corpus file and on a corpus notebook extract', () => {
        const check = coverage(
            [
                ...covered,
                finding('src/corpus/study/analysis.R', 12, 'WARNING', 'r-file-write'),
                finding('notebooks/corpus/a.ipynb.py', 3, 'ERROR', 'py-shell-command'),
                finding('src/corpus/study/analysis.R', 14, 'INFO', 'r-note'),
            ],
            { 'r-security.r': fixture, 'corpus/study/analysis.R': 'x', 'corpus/a.ipynb': '{}' },
        )
        expect(check.failures).toEqual([
            'corpus/study/analysis.R:12: WARNING r-file-write fires on legitimate code',
            'corpus/a.ipynb:3: ERROR py-shell-command fires on legitimate code',
        ])
    })

    it('passes with a corpus alone and no marker file', () => {
        expect(coverage([], { 'corpus/analysis.R': 'mean(x)', 'secrets.r': 'token <- "x"' }).passed).toBe(true)
    })

    it('fails a fixture with sections but no marker', () => {
        expect(coverage([], { 'corpus/a.R': 'x', 'py.py': '# --- 1. Shell\nos.system(x)' }).failures).toEqual([
            'py.py: has sections but no "Legitimate research code" marker',
        ])
    })

    it('fails when there is no legitimate research code at all', () => {
        expect(coverage([], { 'secrets.r': 'token <- "x"' }).failures).toEqual(['no legitimate research code to check'])
    })

    it('fails each Semgrep scan error', () => {
        const check = coverage(covered, { 'r-security.r': fixture }, [{ type: 'Timeout', path: 'notebooks/a.Rmd.R' }])
        expect(check.failures).toEqual(['semgrep error: Timeout a.Rmd'])
    })
})

describe('coverageCheck regressions', () => {
    const legitimate = { 'corpus/analysis.R': 'mean(x)' }
    const withRegressions = (results: SemgrepFinding[], files: Record<string, string> = legitimate) =>
        coverageCheck({ report: { results, errors: [] }, testFiles: new Map(Object.entries(files)) })

    it('passes when every regression finding is present', () => {
        expect(withRegressions(allRegressions())).toEqual({ name: 'coverage', passed: true, failures: [] })
    })

    it('fails a regression finding that is missing, by file and line', () => {
        const results = allRegressions().filter((r) => !r.path.endsWith('/.Rprofile.R'))
        expect(withRegressions(results).failures).toEqual(['.Rprofile.R:1: no r-shell-command finding'])
    })

    it('matches a notebook regression on any line', () => {
        const results = allRegressions().map((r) =>
            r.path.endsWith('analysis.ipynb') ? { ...r, start: { line: 40 } } : r,
        )
        expect(withRegressions(results).passed).toBe(true)
    })

    it('fails a gating finding on an ok example in secrets.r', () => {
        const secrets = '# ok: secret\ntoken <- "x"\n'
        const check = withRegressions(
            [...allRegressions(), finding('src/secrets.r', 2, 'WARNING', 'secret-github-token')],
            { ...legitimate, 'secrets.r': secrets },
        )
        expect(check.failures).toEqual(['secrets.r:2: rules.secret-github-token fires on an ok example'])
    })
})
