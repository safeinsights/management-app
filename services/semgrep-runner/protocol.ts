import { z } from 'zod'

// The parts of Semgrep's JSON report that the runner reads.
export interface SemgrepFinding {
    check_id: string
    path: string
    start: { line: number }
    extra: { severity: string; message: string }
}

export interface SemgrepError {
    type?: unknown
    message?: string
    path?: string
}

export interface SemgrepOutput {
    results?: SemgrepFinding[]
    errors?: SemgrepError[]
    paths?: { scanned?: string[] }
}

/**
 * The states a Semgrep run can end in. "No findings" is only claimed on positive evidence: an R or
 * Python file was parsed and every rule finished on every file. A rule that times out or a file that
 * fails to parse leaves part of the submission unexamined, which is not clean.
 */
export type SemgrepOutcome =
    | 'FINDINGS-FOUND'
    | 'NO-FINDINGS'
    | 'PARTIALLY-SCANNED'
    | 'NOTHING-SCANNED'
    | 'DID-NOT-COMPLETE'

export const RULESET_ENVS = ['dev', 'sandbox', 'staging', 'demo', 'production'] as const
export type RulesetEnv = (typeof RULESET_ENVS)[number]

// Inside a ruleset version, rule files and their test fixtures live under separate prefixes, so a YAML
// fixture is never loaded as a rule.
export const RULESET_RULES_DIR = 'rules'
export const RULESET_TESTS_DIR = 'tests'

export const rulesetRulesPrefix = (env: RulesetEnv, version: string) =>
    `rulesets/${env}/${version}/${RULESET_RULES_DIR}/`

// Python's Path.suffixes, which Semgrep's rule file test uses.
function pathSuffixes(file: string): string[] {
    const name = file.slice(file.lastIndexOf('/') + 1)
    if (name.endsWith('.')) return []
    return name
        .replace(/^\.+/, '')
        .split('.')
        .slice(1)
        .map((suffix) => `.${suffix}`)
}

// Semgrep's is_config_suffix: a rule file ends in .yaml or .yml (case sensitive), and *.test.yaml or any
// .fixed suffix is a fixture. A dot-name is left out too: a scan loads it, but the fixture test skips it.
export function isRuleFile(file: string): boolean {
    const suffixes = pathSuffixes(file)
    const last = suffixes.at(-1)
    return (
        (last === '.yaml' || last === '.yml') &&
        suffixes.at(-2) !== '.test' &&
        !suffixes.includes('.fixed') &&
        !file.split('/').some((segment) => segment.startsWith('.'))
    )
}

// A backslash is an ordinary file name character on Linux, and the app keeps it in uploaded names.
export function isSafeRelativePath(value: string): boolean {
    if (!value || value.includes('\0') || value.startsWith('/')) return false
    return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

// A repeated path, or a path that is also the folder of another one, would silently replace a file.
export function distinctPaths(items: { path: string }[]): boolean {
    const paths = new Set(items.map((item) => item.path))
    if (paths.size !== items.length) return false
    return items.every(({ path }) => {
        const segments = path.split('/')
        return segments.slice(1).every((_, i) => !paths.has(segments.slice(0, i + 1).join('/')))
    })
}

const relativePath = z.string().min(1).max(512).refine(isSafeRelativePath, 'unsafe path')

export const testFileSchema = z.object({ path: relativePath, content: z.string() })

const fileList = <T extends z.ZodType<{ path: string }>>(item: T) =>
    z.array(item).min(1).refine(distinctPaths, 'duplicate or conflicting paths')

// The fixture test pairs rules/<dir>/<stem>.yaml with src/<dir>/<stem>.<any ext> and every file under
// src/<dir>/<stem>/; an unpaired file is only scanned, and zero checks is not a pass. It reads notebooks
// as is, not their extracts, so an R or Python match in a notebook shows in findings but not as a check.
export const runnerRequestSchema = z.discriminatedUnion('mode', [
    z.object({
        mode: z.literal('test'),
        rules: fileList(z.object({ path: relativePath.refine(isRuleFile, 'not a rule file'), content: z.string() })),
        files: fileList(testFileSchema),
    }),
    z.object({
        mode: z.literal('scan'),
        submission: z.object({ bucket: z.string().min(1), prefix: z.string().min(1) }),
        rulesetVersion: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
    }),
])
export type RunnerRequest = z.infer<typeof runnerRequestSchema>
export type TestRequest = Extract<RunnerRequest, { mode: 'test' }>
export type ScanRequest = Extract<RunnerRequest, { mode: 'scan' }>

// Follows what Semgrep's Python fixture test prints, which differs from its .atd interface for errors.
const testMatchSchema = z.looseObject({
    expected_lines: z.array(z.number()).default([]),
    reported_lines: z.array(z.number()).default([]),
})

export const semgrepTestsResultSchema = z.looseObject({
    results: z.record(
        z.string(),
        z.looseObject({
            checks: z.record(
                z.string(),
                z.looseObject({
                    passed: z.boolean(),
                    matches: z.record(z.string(), testMatchSchema).default({}),
                    errors: z.array(z.unknown()).default([]),
                }),
            ),
        }),
    ),
    fixtest_results: z.record(z.string(), z.looseObject({ passed: z.boolean() })).default({}),
    config_missing_tests: z.array(z.string()).default([]),
    config_missing_fixtests: z.array(z.string()).default([]),
    config_with_errors: z
        .array(z.looseObject({ filename: z.string(), error: z.string(), output: z.unknown() }))
        .default([]),
})
export type SemgrepTestsResult = z.infer<typeof semgrepTestsResultSchema>

export type RunnerError =
    | 'submission-download-failed'
    | 'submission-empty'
    | 'ruleset-download-failed'
    | 'ruleset-empty'
    | 'unsafe-key'
    | 'workspace-failed'
    | 'semgrep-failed'
    | 'deadline'

export type ScanResponse = {
    mode: 'scan'
    rulesetVersion: string
    outcome: SemgrepOutcome
    // First line "Semgrep Scan: <phrase>", which the management app parses.
    log: string
    // The raw report; null when Semgrep wrote none, or when it is left out to fit the response limit.
    semgrepJson: string | null
    semgrepJsonOmitted?: 'too-large'
    // Only the first lines of the log are kept, to fit the response limit.
    logTruncated?: true
    error?: RunnerError
}

export type TestResponse = {
    mode: 'test'
    outcome: SemgrepOutcome
    log: string
    logTruncated?: true
    findings: SemgrepFinding[]
    // Entries dropped from the end of the list to fit the response limit.
    findingsOmitted?: number
    errors: SemgrepError[]
    errorsOmitted?: number
    tests: SemgrepTestsResult | null
    testsError?: 'unparseable-output' | 'too-large'
    error?: RunnerError
}

export type RunnerResponse = ScanResponse | TestResponse
