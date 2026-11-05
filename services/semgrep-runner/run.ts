import * as fs from 'node:fs'
import type { S3Client } from '@aws-sdk/client-s3'
import { readJsonReport } from './json-report.ts'
import {
    isRuleFile,
    rulesetRulesPrefix,
    semgrepTestsResultSchema,
    type RulesetEnv,
    type RunnerError,
    type RunnerRequest,
    type RunnerResponse,
    type ScanRequest,
    type ScanResponse,
    type TestRequest,
    type TestResponse,
} from './protocol.ts'
import {
    extractNotebooks,
    prepareSemgrepReport,
    semgrepFindings,
    semgrepOutcome,
    semgrepPlaintextLog,
    submissionPath,
    type SemgrepError,
    type SemgrepOutput,
} from './semgrep.ts'
import { scanInvocation, testInvocation, type SemgrepCommand } from './semgrep-command.ts'
import {
    createWorkspace,
    downloadPrefix,
    removeWorkspace,
    RunnerFailure,
    writeFiles,
    type Workspace,
} from './workspace.ts'

export type RulesetStorage = {
    s3: S3Client
    rulesBucket: string
    rulesetEnv: RulesetEnv
    // Sent as ExpectedBucketOwner on every rules bucket call; unset only against a local S3 stand-in.
    rulesBucketOwner?: string
}

export type RunnerDeps = {
    semgrep: SemgrepCommand
    signal: AbortSignal
    storage?: RulesetStorage
}

// A synchronous Lambda response is limited to 6 MB.
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024

const DID_NOT_COMPLETE_LOG = semgrepPlaintextLog(null)

export function runRequest(request: RunnerRequest, deps: RunnerDeps): Promise<RunnerResponse> {
    return request.mode === 'scan' ? runScanMode(request, deps) : runTestMode(request, deps)
}

function failureCode(error: unknown, signal: AbortSignal): RunnerError {
    if (signal.aborted) return 'deadline'
    if (error instanceof RunnerFailure) return error.code
    throw error
}

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
    const data = readJsonReport<SemgrepOutput>(work.report)
    // The exit code only: stderr can quote submitted code.
    if (!data) console.warn(JSON.stringify({ semgrepExitCode: result.code }))
    return { data, rawReport: data ? fs.readFileSync(work.report, 'utf-8') : null, aborted: false }
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

async function runScanMode(request: ScanRequest, deps: RunnerDeps): Promise<ScanResponse> {
    const { storage, signal } = deps
    if (!storage) throw new Error('scan mode needs the rules bucket configuration')

    try {
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
            const rules = await downloadPrefix(storage.s3, {
                bucket: storage.rulesBucket,
                prefix: rulesetRulesPrefix(storage.rulesetEnv, request.rulesetVersion),
                dir: work.rules,
                signal,
                failure: 'ruleset-download-failed',
                expectedBucketOwner: storage.rulesBucketOwner,
                include: isRuleFile,
            })
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

// Semgrep prints the absolute paths it was given; strip the work dir so they read rules/... and src/...
export function parseTestsResult(stdout: string, root: string): Pick<TestResponse, 'tests' | 'testsError'> {
    try {
        const parsed = semgrepTestsResultSchema.safeParse(JSON.parse(stdout.replaceAll(`${root}/`, '')))
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

function mapErrorPath(error: SemgrepError): SemgrepError {
    return error.path ? { ...error, path: submissionPath(error.path) } : error
}

export const responseBytes = (response: RunnerResponse) => Buffer.byteLength(JSON.stringify(response))

const fits = (response: RunnerResponse) => responseBytes(response) <= MAX_RESPONSE_BYTES

// The longest leading part of a list that lets the response fit; none when even an empty list does not.
function keepLeading<T, R extends RunnerResponse>(items: T[], build: (kept: T[]) => R): R {
    let fitting = 0
    let tooLarge = items.length
    while (tooLarge - fitting > 1) {
        const middle = Math.floor((fitting + tooLarge) / 2)
        if (fits(build(items.slice(0, middle)))) fitting = middle
        else tooLarge = middle
    }
    return build(items.slice(0, fitting))
}

// The status line stays: the management app reads the outcome from it.
function truncateLog<R extends RunnerResponse>(response: R): R {
    const [status, ...rest] = response.log.split('\n')
    return keepLeading(rest, (kept) => ({
        ...response,
        log: [status, ...kept, '(log truncated to fit the response limit)'].join('\n'),
        logTruncated: true,
    }))
}

// Each step leaves out more until the response fits; the status line alone always does.
function fitResponse<R extends RunnerResponse>(response: R, steps: ((response: R) => R)[]): R {
    let fitted = response
    for (const step of steps) {
        if (fits(fitted)) return fitted
        fitted = step(fitted)
    }
    return fitted
}

// The outcome and log are computed from the full report before anything is left out.
export function fitScanResponse(response: ScanResponse): ScanResponse {
    return fitResponse(response, [(r) => ({ ...r, semgrepJson: null, semgrepJsonOmitted: 'too-large' }), truncateLog])
}

// The fixture test results go last: nothing else in the response repeats them.
function shortenLogOrDropTests(response: TestResponse): TestResponse {
    const shorterLog = truncateLog(response)
    if (fits(shorterLog)) return shorterLog
    const withoutTests: TestResponse = { ...response, tests: null, testsError: 'too-large' }
    return fits(withoutTests) ? withoutTests : truncateLog(withoutTests)
}

export function fitTestResponse(response: TestResponse): TestResponse {
    return fitResponse(response, [
        (r) =>
            keepLeading(r.findings, (kept) => ({
                ...r,
                findings: kept,
                findingsOmitted: r.findings.length - kept.length,
            })),
        (r) => keepLeading(r.errors, (kept) => ({ ...r, errors: kept, errorsOmitted: r.errors.length - kept.length })),
        shortenLogOrDropTests,
    ])
}
