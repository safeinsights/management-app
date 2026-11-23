import * as fs from 'node:fs'
import * as path from 'node:path'
import type { RulesetStorage } from './config.ts'
import {
    coverageCheck,
    evaluateFixtures,
    evaluateIntegrity,
    evaluateRules,
    gateResult,
    readGateVersion,
    skippedChecks,
    testFilePaths,
} from './gate.ts'
import { readJsonReport } from './json-report.ts'
import {
    isRuleFile,
    RULESET_RULES_DIR,
    RULESET_TESTS_DIR,
    rulesetVersionPrefix,
    semgrepTestsResultSchema,
    type GateRequest,
    type GateResponse,
    type RunnerError,
    type RunnerRequest,
    type RunnerResponse,
    type ScanRequest,
    type ScanResponse,
    type SemgrepError,
    type SemgrepOutput,
    type TestRequest,
    type TestResponse,
} from './protocol.ts'
import { fitScanResponse, fitTestResponse } from './response-fit.ts'
import {
    extractNotebooks,
    prepareSemgrepReport,
    semgrepFindings,
    semgrepOutcome,
    semgrepPlaintextLog,
    submissionPath,
} from './semgrep.ts'
import { scanInvocation, testInvocation, validateInvocation, type SemgrepCommand } from './semgrep-command.ts'
import {
    createWorkspace,
    downloadFiles,
    downloadPrefix,
    removeWorkspace,
    RunnerFailure,
    writeFiles,
    type Workspace,
} from './workspace.ts'

export type RunnerDeps = {
    semgrep: SemgrepCommand
    signal: AbortSignal
    storage?: RulesetStorage
}

const DID_NOT_COMPLETE_LOG = semgrepPlaintextLog(null)

export function runRequest(request: GateRequest, deps: RunnerDeps): Promise<GateResponse>
export function runRequest(request: ScanRequest | TestRequest, deps: RunnerDeps): Promise<ScanResponse | TestResponse>
export function runRequest(request: RunnerRequest, deps: RunnerDeps): Promise<RunnerResponse>
export function runRequest(request: RunnerRequest, deps: RunnerDeps): Promise<RunnerResponse> {
    if (request.mode === 'gate') return runGateMode(request, deps)
    return request.mode === 'scan' ? runScanMode(request, deps) : runTestMode(request, deps)
}

function failureCode(error: unknown, signal: AbortSignal): RunnerError {
    if (signal.aborted) return 'deadline'
    if (error instanceof RunnerFailure) return error.code
    throw error
}

// Semgrep prints the absolute paths it was given: the rules folder in rule errors, and every path in the
// fixture test. Strip the work dir so they read rules/... and src/..., the same on every run.
const withoutWorkRoot = (text: string, root: string) => text.replaceAll(`${root}/`, '')

type ScanResult = { data: SemgrepOutput | null; rawReport: string | null; aborted: boolean }

async function scanWorkspace(work: Workspace, { semgrep, signal }: RunnerDeps): Promise<ScanResult> {
    try {
        extractNotebooks(work.src, work.notebooks)
        prepareSemgrepReport(work.report)
    } catch (error) {
        throw new RunnerFailure('workspace-failed', { cause: error })
    }
    signal.throwIfAborted()
    const result = await semgrep(scanInvocation(work), { cwd: work.root, signal })
    if (result.aborted || signal.aborted) return { data: null, rawReport: null, aborted: true }

    // As in CodeBuild, a report is used whatever Semgrep's exit code was.
    if (!readJsonReport<SemgrepOutput>(work.report)) {
        // The exit code only: stderr can quote submitted code.
        console.warn(JSON.stringify({ semgrepExitCode: result.code }))
        return { data: null, rawReport: null, aborted: false }
    }
    const rawReport = withoutWorkRoot(fs.readFileSync(work.report, 'utf-8'), work.root)
    return { data: JSON.parse(rawReport) as SemgrepOutput, rawReport, aborted: false }
}

async function withWorkspace<T>(run: (work: Workspace) => Promise<T>): Promise<T> {
    const work = await createWorkspace()
    try {
        return await run(work)
    } finally {
        await removeWorkspace(work)
    }
}

function scanFailure(request: ScanRequest, error: RunnerError): ScanResponse {
    return {
        mode: 'scan',
        rulesetVersion: request.rulesetVersion,
        outcome: 'DID-NOT-COMPLETE',
        log: DID_NOT_COMPLETE_LOG,
        semgrepJson: null,
        error,
    }
}

// The scan reads only the files that version.json lists, so a file added after the gate cannot change its rules.
async function runScanMode(request: ScanRequest, deps: RunnerDeps): Promise<ScanResponse> {
    const { storage, signal } = deps
    if (!storage) throw new Error('scan mode needs the rules bucket configuration')

    try {
        const { manifest, storedFiles } = await readGateVersion(storage, request.rulesetVersion, signal)
        if (!evaluateIntegrity(manifest.files, storedFiles).passed) return scanFailure(request, 'manifest-invalid')

        return await withWorkspace(async (work) => {
            const prefix = request.submission.prefix.endsWith('/')
                ? request.submission.prefix
                : `${request.submission.prefix}/`
            const files = await downloadPrefix(storage.s3, {
                bucket: request.submission.bucket,
                prefix,
                dir: work.src,
                signal,
                failure: 'submission-download-failed',
            })
            // Every submission has code, so no files means a wrong bucket or prefix, not an empty scan.
            if (files === 0) return scanFailure(request, 'submission-empty')
            signal.throwIfAborted()
            const rules = await downloadFiles(
                storage.s3,
                versionDownload(
                    storage,
                    signal,
                    versionPath(storage, request.rulesetVersion, RULESET_RULES_DIR),
                    work.rules,
                ),
                filesUnder(manifest.files, RULESET_RULES_DIR).filter(isRuleFile),
            )
            if (rules === 0) return scanFailure(request, 'ruleset-empty')

            const scan = await scanWorkspace(work, deps)
            if (scan.aborted) return scanFailure(request, 'deadline')
            if (!scan.data) return scanFailure(request, 'semgrep-failed')
            return fitScanResponse({
                mode: 'scan',
                rulesetVersion: request.rulesetVersion,
                outcome: semgrepOutcome(scan.data),
                log: semgrepPlaintextLog(scan.data),
                semgrepJson: scan.rawReport,
            })
        })
    } catch (error) {
        return scanFailure(request, failureCode(error, signal))
    }
}

function testFailure(error: RunnerError): TestResponse {
    return {
        mode: 'test',
        outcome: 'DID-NOT-COMPLETE',
        log: DID_NOT_COMPLETE_LOG,
        findings: [],
        errors: [],
        tests: null,
        error,
    }
}

export function parseTestsResult(stdout: string, root: string): Pick<TestResponse, 'tests' | 'testsError'> {
    try {
        const parsed = semgrepTestsResultSchema.safeParse(JSON.parse(withoutWorkRoot(stdout, root)))
        if (parsed.success) return { tests: parsed.data }
    } catch {
        // not JSON
    }
    return { tests: null, testsError: 'unparseable-output' }
}

async function runTestMode(request: TestRequest, deps: RunnerDeps): Promise<TestResponse> {
    const { semgrep, signal } = deps
    try {
        return await withWorkspace(async (work) => {
            await writeFiles(work.rules, request.rules)
            await writeFiles(work.src, request.files)

            const [scan, fixtureTest] = await Promise.allSettled([
                scanWorkspace(work, deps),
                semgrep(testInvocation(work), { cwd: work.root, signal }),
            ])
            if (signal.aborted) return testFailure('deadline')
            if (scan.status === 'rejected') throw scan.reason
            if (fixtureTest.status === 'rejected') throw fixtureTest.reason
            if (scan.value.aborted || fixtureTest.value.aborted) return testFailure('deadline')
            const data = scan.value.data
            if (!data) return testFailure('semgrep-failed')

            return fitTestResponse({
                mode: 'test',
                outcome: semgrepOutcome(data),
                log: semgrepPlaintextLog(data),
                findings: semgrepFindings(data),
                errors: (data.errors ?? []).map(mapErrorPath),
                ...parseTestsResult(fixtureTest.value.stdout, work.root),
            })
        })
    } catch (error) {
        return testFailure(failureCode(error, signal))
    }
}

function gateFailure(request: GateRequest, error: RunnerError): GateResponse {
    return { mode: 'gate', rulesetVersion: request.rulesetVersion, passed: false, checks: [], error }
}

async function runGateMode(request: GateRequest, deps: RunnerDeps): Promise<GateResponse> {
    const { storage, semgrep, signal } = deps
    if (!storage) throw new Error('gate mode needs the rules bucket configuration')

    try {
        const { manifest, storedFiles } = await readGateVersion(storage, request.rulesetVersion, signal)
        const integrity = evaluateIntegrity(manifest.files, storedFiles)
        if (!integrity.passed) return gateResult(request.rulesetVersion, [integrity, ...skippedChecks()])

        return await withWorkspace(async (work) => {
            await downloadFiles(
                storage.s3,
                versionDownload(
                    storage,
                    signal,
                    versionPath(storage, request.rulesetVersion, RULESET_RULES_DIR),
                    work.rules,
                ),
                filesUnder(manifest.files, RULESET_RULES_DIR).filter(isRuleFile),
            )
            await downloadFiles(
                storage.s3,
                versionDownload(
                    storage,
                    signal,
                    versionPath(storage, request.rulesetVersion, RULESET_TESTS_DIR),
                    work.src,
                ),
                testFilePaths(manifest),
            )
            signal.throwIfAborted()

            const settled = await Promise.allSettled([
                scanWorkspace(work, deps),
                semgrep(testInvocation(work), { cwd: work.root, signal }),
                semgrep(validateInvocation(work), { cwd: work.root, signal }),
            ])
            if (signal.aborted) return gateFailure(request, 'deadline')
            const scan = settledValue(settled[0])
            const fixtureTest = settledValue(settled[1])
            const validate = settledValue(settled[2])
            if (scan.aborted || fixtureTest.aborted || validate.aborted) return gateFailure(request, 'deadline')
            if (!scan.data) return gateFailure(request, 'semgrep-failed')

            const { tests, testsError } = parseTestsResult(fixtureTest.stdout, work.root)
            const testFiles = readTestFiles(work.src, testFilePaths(manifest))
            return gateResult(request.rulesetVersion, [
                integrity,
                evaluateRules({ ...validate, stdout: withoutWorkRoot(validate.stdout, work.root) }, tests),
                evaluateFixtures(tests, testsError, withoutWorkRoot(fixtureTest.stderr, work.root)),
                coverageCheck({ report: scan.data, testFiles }),
            ])
        })
    } catch (error) {
        return gateFailure(request, failureCode(error, signal))
    }
}

const versionPath = (storage: RulesetStorage, version: string, dir: string) =>
    `${rulesetVersionPrefix(storage.rulesetEnv, version)}${dir}/`

const versionDownload = (storage: RulesetStorage, signal: AbortSignal, prefix: string, dir: string) => ({
    bucket: storage.rulesBucket,
    prefix,
    dir,
    signal,
    failure: 'ruleset-download-failed' as const,
    expectedBucketOwner: storage.rulesBucketOwner,
})

const filesUnder = (files: string[], dir: string) =>
    files.filter((file) => file.startsWith(`${dir}/`)).map((file) => file.slice(dir.length + 1))

function settledValue<T>(result: PromiseSettledResult<T>): T {
    if (result.status === 'rejected') throw result.reason
    return result.value
}

function readTestFiles(dir: string, paths: string[]): Map<string, string> {
    try {
        return new Map(paths.map((file) => [file, fs.readFileSync(path.join(dir, file), 'utf-8')]))
    } catch (error) {
        throw new RunnerFailure('workspace-failed', { cause: error })
    }
}

function mapErrorPath(error: SemgrepError): SemgrepError {
    return error.path ? { ...error, path: submissionPath(error.path) } : error
}
