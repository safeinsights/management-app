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

export const RULESET_MANIFEST_FILE = 'version.json'
// Inside tests/: research code that no ERROR or WARNING rule may fire on.
export const RULESET_CORPUS_DIR = 'corpus'
export const LEGITIMATE_CODE_MARKER = 'Legitimate research code'

export const rulesetVersionSchema = z.string().regex(/^v[1-9][0-9]{0,8}$/)
export const rulesetVersionPrefix = (env: RulesetEnv, version: string) => `rulesets/${env}/${version}/`

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

// rules/<a rule file> or tests/<any safe path>: nothing else belongs in a ruleset version.
export function isRulesetFilePath(path: string): boolean {
    if (!isSafeRelativePath(path)) return false
    if (path.startsWith(`${RULESET_RULES_DIR}/`)) return isRuleFile(path.slice(RULESET_RULES_DIR.length + 1))
    return path.startsWith(`${RULESET_TESTS_DIR}/`) && path.length > RULESET_TESTS_DIR.length + 1
}

export const rulesetFilePathSchema = z.string().min(1).max(512).refine(isRulesetFilePath, 'not a ruleset file path')

export const hasRuleFile = (paths: string[]) => paths.some((path) => path.startsWith(`${RULESET_RULES_DIR}/`))

export const rulesetPersonSchema = z.object({ userId: z.uuid().nullable(), name: z.string().min(1).max(200) })
export type RulesetPerson = z.infer<typeof rulesetPersonSchema>

export const rulesetManifestSchema = z.object({
    schemaVersion: z.literal(1),
    version: rulesetVersionSchema,
    env: z.enum(RULESET_ENVS),
    createdAt: z.iso.datetime(),
    author: rulesetPersonSchema,
    changeNote: z.string().min(1).max(2000),
    source: z.object({ env: z.enum(RULESET_ENVS), version: rulesetVersionSchema }).nullable(),
    files: z
        .array(rulesetFilePathSchema)
        .min(1)
        .refine((files) => distinctPaths(files.map((path) => ({ path }))), 'duplicate or conflicting paths')
        .refine(hasRuleFile, 'no rule file'),
})
export type RulesetManifest = z.infer<typeof rulesetManifestSchema>

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
    z.object({ mode: z.literal('gate'), rulesetVersion: rulesetVersionSchema }),
])
export type RunnerRequest = z.infer<typeof runnerRequestSchema>
export type TestRequest = Extract<RunnerRequest, { mode: 'test' }>
export type ScanRequest = Extract<RunnerRequest, { mode: 'scan' }>
export type GateRequest = Extract<RunnerRequest, { mode: 'gate' }>

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
    | 'manifest-invalid'

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

// The caps keep a gate response far below the 6 MB limit of a synchronous Lambda response.
export const GATE_CHECKS = ['integrity', 'rules', 'fixtures', 'coverage'] as const
export const GATE_FAILURES_CAP = 100
export const GATE_FAILURE_MAX_CHARS = 2000

export const gateCheckSchema = z.object({
    name: z.enum(GATE_CHECKS),
    passed: z.boolean(),
    // Not run, because the integrity check failed.
    skipped: z.literal(true).optional(),
    failures: z.array(z.string()),
    failuresOmitted: z.number().int().positive().optional(),
})
export type GateCheck = z.infer<typeof gateCheckSchema>

export const gateResponseSchema = z.object({
    mode: z.literal('gate'),
    rulesetVersion: z.string(),
    // True only when every check passed and error is unset.
    passed: z.boolean(),
    checks: z.array(gateCheckSchema),
    error: z.string().optional(),
})
export type GateResponse = z.infer<typeof gateResponseSchema>

export type RunnerResponse = ScanResponse | TestResponse | GateResponse
