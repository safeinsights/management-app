import { GetObjectCommand } from '@aws-sdk/client-s3'
import { posix } from 'node:path'
import type { RulesetStorage } from './config.ts'
import {
    GATE_CHECKS,
    GATE_FAILURE_MAX_CHARS,
    GATE_FAILURES_CAP,
    LEGITIMATE_CODE_MARKER,
    RULESET_CORPUS_DIR,
    RULESET_MANIFEST_FILE,
    RULESET_TESTS_DIR,
    rulesetManifestSchema,
    rulesetVersionPrefix,
    type GateCheck,
    type GateResponse,
    type RulesetManifest,
    type SemgrepOutput,
    type SemgrepTestsResult,
    type TestResponse,
} from './protocol.ts'
import { ruleName, submissionPath } from './semgrep.ts'
import type { CommandResult } from './semgrep-command.ts'
import { listPrefixKeys, RunnerFailure } from './workspace.ts'

type GateCheckName = (typeof GATE_CHECKS)[number]

const SECTION_HEADER = /^# --- (\d+)\./
const GATING_SEVERITIES = new Set(['ERROR', 'WARNING'])

export function gateCheck(name: GateCheckName, failures: string[]): GateCheck {
    const distinct = [...new Set(failures)].map((failure) => failure.slice(0, GATE_FAILURE_MAX_CHARS))
    const kept = distinct.slice(0, GATE_FAILURES_CAP)
    const omitted = distinct.length - kept.length
    return {
        name,
        passed: distinct.length === 0,
        failures: kept,
        ...(omitted > 0 ? { failuresOmitted: omitted } : {}),
    }
}

export function gateResult(rulesetVersion: string, checks: GateCheck[]): GateResponse {
    return { mode: 'gate', rulesetVersion, passed: checks.every((check) => check.passed), checks }
}

const skippedCheck = (name: GateCheckName): GateCheck => ({ name, passed: false, skipped: true, failures: [] })

export const skippedChecks = () => GATE_CHECKS.filter((name) => name !== 'integrity').map(skippedCheck)

export type GateVersion = { manifest: RulesetManifest; storedFiles: string[] }

// Lists the version first: a GetObject on a missing key can answer 403 rather than 404 across accounts.
export async function readGateVersion(
    storage: RulesetStorage,
    version: string,
    signal: AbortSignal,
): Promise<GateVersion> {
    const prefix = rulesetVersionPrefix(storage.rulesetEnv, version)
    const location = { Bucket: storage.rulesBucket, ExpectedBucketOwner: storage.rulesBucketOwner }
    let keys: string[]
    try {
        keys = await listPrefixKeys(storage.s3, {
            bucket: storage.rulesBucket,
            prefix,
            signal,
            expectedBucketOwner: storage.rulesBucketOwner,
        })
    } catch (error) {
        throw new RunnerFailure('ruleset-download-failed', { cause: error })
    }
    const manifestKey = `${prefix}${RULESET_MANIFEST_FILE}`
    if (!keys.includes(manifestKey)) throw new RunnerFailure('manifest-invalid')

    let text: string
    try {
        const object = await storage.s3.send(new GetObjectCommand({ ...location, Key: manifestKey }), {
            abortSignal: signal,
        })
        text = (await object.Body?.transformToString('utf-8')) ?? ''
    } catch (error) {
        throw new RunnerFailure('ruleset-download-failed', { cause: error })
    }
    const manifest = parseManifest(text)
    if (!manifest || manifest.version !== version || manifest.env !== storage.rulesetEnv) {
        throw new RunnerFailure('manifest-invalid')
    }
    const storedFiles = keys.filter((key) => key !== manifestKey).map((key) => key.slice(prefix.length))
    return { manifest, storedFiles }
}

function parseManifest(text: string): RulesetManifest | null {
    try {
        const parsed = rulesetManifestSchema.safeParse(JSON.parse(text))
        return parsed.success ? parsed.data : null
    } catch {
        return null
    }
}

// version.json lists every file, so an upload that stopped halfway, or a file added later, fails here.
export function evaluateIntegrity(listed: string[], stored: string[]): GateCheck {
    const storedSet = new Set(stored)
    const listedSet = new Set(listed)
    return gateCheck('integrity', [
        ...listed.filter((path) => !storedSet.has(path)).map((path) => `missing: ${path}`),
        ...stored.filter((path) => !listedSet.has(path)).map((path) => `not in version.json: ${path}`),
    ])
}

const describeType = (type: unknown) => (typeof type === 'string' ? type : JSON.stringify(type))

type ValidateError = { type?: unknown; message?: unknown; long_msg?: unknown; short_msg?: unknown }

function validateErrors(stdout: string): ValidateError[] | null {
    try {
        const errors = (JSON.parse(stdout) as { errors?: unknown }).errors
        return Array.isArray(errors) && errors.length > 0 ? errors : null
    } catch {
        return null
    }
}

// The stdout of `semgrep --validate` must already have the work dir stripped.
export function evaluateRules(validate: CommandResult, tests: SemgrepTestsResult | null): GateCheck {
    const failures: string[] = []
    if (validate.code !== 0) {
        const errors = validateErrors(validate.stdout)
        if (errors) {
            // A schema error carries long_msg and short_msg; the others carry message.
            for (const error of errors) {
                failures.push(
                    `${describeType(error.type)}: ${String(error.message ?? error.long_msg ?? error.short_msg ?? '')}`,
                )
            }
        } else {
            failures.push(`semgrep --validate failed (exit ${validate.code})`)
        }
    }
    for (const config of tests?.config_with_errors ?? []) failures.push(`${config.filename}: ${config.error}`)
    return gateCheck('rules', failures)
}

// On an annotation error the fixture test exits without JSON and names the cause only on stderr.
const FIXTURE_ERROR_LINE = /rule id mismatch|^Failing due to /

// The stderr of the fixture test must already have the work dir stripped.
export function evaluateFixtures(
    tests: SemgrepTestsResult | null,
    testsError: TestResponse['testsError'],
    stderr = '',
): GateCheck {
    if (!tests || testsError) {
        const causes = stderr
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => FIXTURE_ERROR_LINE.test(line))
        return gateCheck('fixtures', [`fixture test output unavailable (${testsError ?? 'no output'})`, ...causes])
    }
    const failures: string[] = []
    let checks = 0
    for (const [file, result] of Object.entries(tests.results)) {
        for (const [id, check] of Object.entries(result.checks)) {
            checks++
            if (check.passed) continue
            const matches = Object.values(check.matches)
            const expected = matches.flatMap((match) => match.expected_lines)
            const reported = matches.flatMap((match) => match.reported_lines)
            failures.push(
                `${file}: ${id} failed (expected lines ${expected.join(', ') || 'none'}, reported ${reported.join(', ') || 'none'})`,
            )
        }
    }
    for (const [file, fixtest] of Object.entries(tests.fixtest_results)) {
        if (!fixtest.passed) failures.push(`${file}: autofix test failed`)
    }
    if (checks === 0) failures.push('no fixture checks ran')
    for (const file of tests.config_missing_tests) failures.push(`${file}: rule file has no test file`)
    return gateCheck('fixtures', failures)
}

type CoverageFinding = { path: string; rule: string; line: number; severity: string }

const legitimateCodeFailure = (finding: CoverageFinding) =>
    `${finding.path}:${finding.line}: ${finding.severity} ${finding.rule} fires on legitimate code`

const isCorpusPath = (path: string) => path.startsWith(`${RULESET_CORPUS_DIR}/`)

function sectionFailures(path: string, text: string, findings: CoverageFinding[]): string[] {
    const lines = text.split('\n')
    const markerLine = lines.findIndex((line) => line.includes(LEGITIMATE_CODE_MARKER)) + 1
    const sections: { name: string; from: number; to: number }[] = []
    for (const [i, line] of lines.slice(0, markerLine - 1).entries()) {
        const match = line.match(SECTION_HEADER)
        if (!match) continue
        const previous = sections.at(-1)
        if (previous) previous.to = i
        sections.push({ name: match[1], from: i + 1, to: markerLine })
    }
    const own = findings.filter((finding) => finding.path === path)
    return [
        ...sections
            .filter((section) => !own.some((finding) => finding.line > section.from && finding.line <= section.to))
            .map((section) => `${path}: no finding in section ${section.name}`),
        ...own
            .filter((finding) => finding.line > markerLine && GATING_SEVERITIES.has(finding.severity))
            .map(legitimateCodeFailure),
    ]
}

/**
 * The card's coverage check: every numbered fixture section before the "Legitimate research code" marker
 * has a finding, and no ERROR or WARNING finding lands after the marker or anywhere in tests/corpus/.
 * testFiles maps each path relative to tests/ to its text.
 */
export type CoverageInput = { report: SemgrepOutput; testFiles: Map<string, string> }

export function evaluateCoverage(input: CoverageInput): GateCheck {
    return gateCheck('coverage', coverageFailures(input))
}

// The fixture sections and the legitimate code, plus the regression findings of check-coverage.ts.
export function coverageCheck(input: CoverageInput): GateCheck {
    return gateCheck('coverage', [...coverageFailures(input), ...regressionFailures(input.report, input.testFiles)])
}

function coverageFailures({ report, testFiles }: CoverageInput): string[] {
    const failures: string[] = []
    for (const error of report.errors ?? []) {
        failures.push(
            `semgrep error: ${describeType(error.type)} ${error.path ? submissionPath(error.path) : ''}`.trim(),
        )
    }
    const findings = (report.results ?? []).map((result) => ({
        path: submissionPath(result.path),
        rule: ruleName(result.check_id),
        line: result.start.line,
        severity: result.extra.severity,
    }))

    let legitimateFiles = 0
    for (const finding of findings) {
        if (isCorpusPath(finding.path) && GATING_SEVERITIES.has(finding.severity)) {
            failures.push(legitimateCodeFailure(finding))
        }
    }
    for (const [path, text] of testFiles) {
        if (isCorpusPath(path)) {
            legitimateFiles++
        } else if (text.includes(LEGITIMATE_CODE_MARKER)) {
            legitimateFiles++
            failures.push(...sectionFailures(path, text, findings))
        } else if (text.split('\n').some((line) => SECTION_HEADER.test(line))) {
            failures.push(`${path}: has sections but no "${LEGITIMATE_CODE_MARKER}" marker`)
        }
    }
    if (legitimateFiles === 0) failures.push('no legitimate research code to check')
    return failures
}

// Matched on the reported path's basename, as check-coverage.ts does, so notebook extracts match too.
// A null line means any line: a notebook's line numbers depend on its JSON layout.
export const REGRESSION_FINDINGS: [file: string, line: number | null, rule: string][] = [
    ['.Rprofile.R', 1, 'r-shell-command'],
    ['Rprofile.site.R', 1, 'r-shell-command'],
    ['inline.qmd.R', 1, 'r-shell-command'],
    ['quarto.qmd.R', 1, 'r-shell-command'],
    ['multiline.Rmd.R', 1, 'r-shell-command'],
    ['quoted.Rmd.R', 2, 'r-shell-command'],
    ['nested.Rmd.R', 3, 'r-shell-command'],
    ['study.Rmarkdown.R', 2, 'r-shell-command'],
    ['analysis.ipynb.py', null, 'py-shell-command'],
    ['analysis.ipynb', null, 'notebook-shell-magic'],
    ...[2, 6, 10, 14, 18].map((line): [string, number, string] => [
        'notebook.Rmd',
        line,
        'notebook-unsupported-engine',
    ]),
]

function regressionFailures(report: SemgrepOutput, testFiles: Map<string, string>): string[] {
    const results = report.results ?? []
    const failures: string[] = []
    for (const [file, line, rule] of REGRESSION_FINDINGS) {
        const found = results.some(
            (r) =>
                posix.basename(r.path) === file &&
                (line === null || r.start.line === line) &&
                r.check_id.endsWith(rule),
        )
        if (!found) failures.push(`${file}${line === null ? '' : `:${line}`}: no ${rule} finding`)
    }
    // A secrets.r example marked ok: must stay clean. The finding's line sits under the ok: comment.
    for (const r of results) {
        if (posix.basename(r.path) !== 'secrets.r' || !GATING_SEVERITIES.has(r.extra.severity)) continue
        const lines = (testFiles.get(submissionPath(r.path)) ?? '').split('\n')
        if (lines[r.start.line - 2]?.includes('ok:')) {
            failures.push(`secrets.r:${r.start.line}: ${r.check_id} fires on an ok example`)
        }
    }
    return failures
}

// Paths in version.json that are test files, relative to tests/.
export const testFilePaths = (manifest: RulesetManifest) =>
    manifest.files
        .filter((path) => path.startsWith(`${RULESET_TESTS_DIR}/`))
        .map((path) => path.slice(RULESET_TESTS_DIR.length + 1))
