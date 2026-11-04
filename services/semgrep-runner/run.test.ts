import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { describe, expect, it } from '../../tests/unit.helpers'
import { s3Available } from '../../tests/s3.helpers'
import { s3BucketName } from '../../src/server/aws'
import { rulesetRulesPrefix, type ScanRequest, type TestRequest } from './protocol.ts'
import { MAX_RESPONSE_BYTES, responseBytes, runRequest, type RulesetStorage } from './run.ts'
import { SEMGREP_PYTHON, SEMGREP_TEST_SHIM, type CommandInvocation, type CommandResult } from './semgrep-command.ts'
import type { SemgrepFinding, SemgrepOutput } from './semgrep.ts'

type Call = { invocation: CommandInvocation; cwd: string }

type FakeSemgrep = {
    // Report the scan writes; a string is written as is, undefined writes none.
    report?: SemgrepOutput | string
    fixture?: string
    testCode?: number
    testStdout?: string
    onScan?: (cwd: string) => Partial<CommandResult> | void
}

const fixture = (name: string) =>
    fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name), 'utf-8')

// The fixtures were captured with the work dir stripped; the real CLI prints the absolute paths it got.
const asPrinted = (json: string, root: string) =>
    json.replaceAll('"rules/', `"${root}/rules/`).replaceAll('"src/', `"${root}/src/`)

// Semgrep is an external binary the unit test job does not have; this stands in for it.
function fakeSemgrep({
    report,
    fixture: name = 'tests-pass.json',
    testCode = 0,
    testStdout,
    onScan,
}: FakeSemgrep = {}) {
    const calls: Call[] = []
    const semgrep = async (invocation: CommandInvocation, { cwd }: { cwd: string }): Promise<CommandResult> => {
        calls.push({ invocation, cwd })
        const result = { code: 0, stdout: '', stderr: '', aborted: false }
        if (invocation.args[0] !== 'scan') {
            return { ...result, code: testCode, stdout: testStdout ?? asPrinted(fixture(name), cwd) }
        }
        const output = invocation.args[invocation.args.indexOf('--output') + 1]
        if (report !== undefined) fs.writeFileSync(output, typeof report === 'string' ? report : JSON.stringify(report))
        return { ...result, ...onScan?.(cwd) }
    }
    return { semgrep, calls, scanCall: () => calls.find((c) => c.invocation.args[0] === 'scan')! }
}

function finding(file: string, line: number, severity = 'ERROR', rule = 'secret-github-token'): SemgrepFinding {
    return {
        check_id: `tmp.semgrep-run-x.rules.${rule}`,
        path: file,
        start: { line },
        extra: { severity, message: `${rule} message` },
    }
}

const cannedReport: SemgrepOutput = {
    results: [
        finding('src/analysis.R', 3, 'ERROR', 'r-eval-parse'),
        finding('notebooks/study.Rmd.R', 4),
        finding('src/study.Rmd', 4),
    ],
    errors: [{ type: 'Timeout', path: 'notebooks/study.Rmd.R', message: 'Timeout' }],
    paths: { scanned: ['src/analysis.R', 'notebooks/study.Rmd.R', 'src/study.Rmd'] },
}

// Rules must only ever come from the folder the runner wrote, never the Semgrep registry.
function expectLocalRulesOnly({ invocation, cwd }: Call) {
    const configs = invocation.args.flatMap((arg, i) => (arg === '--config' ? [invocation.args[i + 1]] : []))
    expect(configs).toEqual([path.join(cwd, 'rules')])
    for (const arg of invocation.args) {
        expect(arg).not.toBe('auto')
        expect(arg).not.toMatch(/^(p\/|r\/|s\/|https?:\/\/)/)
    }
}

const signal = () => new AbortController().signal

describe('test mode', () => {
    const request: TestRequest = {
        mode: 'test',
        rules: [{ path: 'secrets.yaml', content: 'rules: []' }],
        files: [
            { path: 'analysis.R', content: 'x <- 1' },
            { path: 'study.Rmd', content: '```{r}\nx <- 1\n```\n' },
        ],
    }

    it('scans with the production flags and runs the fixture test through the shim', async () => {
        const fake = fakeSemgrep({ report: cannedReport })
        await runRequest(request, { semgrep: fake.semgrep, signal: signal() })

        const [scan, fixtureTest] = [fake.scanCall(), fake.calls.find((c) => c.invocation.file === SEMGREP_PYTHON)!]
        const { cwd } = scan
        expect(scan.invocation).toEqual({
            file: 'semgrep',
            args: [
                'scan',
                '--config',
                `${cwd}/rules`,
                '--json',
                '--output',
                `${cwd}/reports/semgrep.json`,
                '--metrics=off',
                '--disable-version-check',
                '--disable-nosem',
                '--no-git-ignore',
                '--x-ignore-semgrepignore-files',
                '--max-target-bytes',
                '0',
                'src',
                'notebooks',
            ],
        })
        expect(fixtureTest.invocation.args).toEqual([
            SEMGREP_TEST_SHIM,
            '--test',
            '--json',
            '--metrics=off',
            '--disable-version-check',
            '--config',
            `${cwd}/rules`,
            'src',
        ])
        fake.calls.forEach(expectLocalRulesOnly)
    })

    it('writes the payload, maps findings and errors, and returns the fixture test results', async () => {
        const fake = fakeSemgrep({
            report: cannedReport,
            onScan: (cwd) => {
                expect(fs.readFileSync(path.join(cwd, 'rules/secrets.yaml'), 'utf-8')).toBe('rules: []')
                expect(fs.readFileSync(path.join(cwd, 'src/analysis.R'), 'utf-8')).toBe('x <- 1')
                expect(fs.existsSync(path.join(cwd, 'notebooks/study.Rmd.R'))).toBe(true)
            },
        })
        const response = await runRequest(request, { semgrep: fake.semgrep, signal: signal() })

        expect(response).toMatchObject({ mode: 'test', outcome: 'FINDINGS-FOUND' })
        expect(response.error).toBeUndefined()
        expect(response.log.split('\n')[0]).toBe('Semgrep Scan: findings found')
        if (response.mode !== 'test') throw new Error('expected a test response')
        expect(response.findings.map((f) => [f.path, f.start.line, f.check_id])).toEqual([
            ['analysis.R', 3, 'r-eval-parse'],
            ['study.Rmd', 4, 'secret-github-token'],
        ])
        expect(response.errors).toEqual([{ type: 'Timeout', path: 'study.Rmd', message: 'Timeout' }])
        expect(Object.keys(response.tests!.results)).toEqual(['rules/secrets.yaml'])
        expect(JSON.stringify(response.tests)).not.toContain(fake.scanCall().cwd)
        expect(fs.existsSync(fake.scanCall().cwd)).toBe(false)
    })

    it('returns a failed check, an invalid rule and an unpaired rule file as results, not errors', async () => {
        const run = (options: FakeSemgrep) =>
            runRequest(request, {
                semgrep: fakeSemgrep({ report: cannedReport, ...options }).semgrep,
                signal: signal(),
            })

        const failed = await run({ fixture: 'tests-check-failed.json', testCode: 1 })
        const invalid = await run({ fixture: 'tests-invalid-rule.json' })
        const unpaired = await run({ fixture: 'tests-unpaired.json' })

        if (failed.mode !== 'test' || invalid.mode !== 'test' || unpaired.mode !== 'test') throw new Error('test mode')
        const checks = Object.values(failed.tests!.results['rules/secrets.yaml'].checks)
        expect(checks.filter((c) => !c.passed)).toHaveLength(1)
        expect(invalid.tests!.config_with_errors[0]).toMatchObject({ filename: 'rules/invalid.yaml' })
        expect(invalid.tests!.config_with_errors[0].error).toContain('Traceback')
        expect(unpaired.tests).toMatchObject({ results: {}, config_missing_tests: ['rules/a.yaml'] })
    })

    it('reports fixture test output that is not JSON without failing the scan', async () => {
        const fake = fakeSemgrep({ report: cannedReport, testStdout: 'Traceback (most recent call last):' })
        const response = await runRequest(request, { semgrep: fake.semgrep, signal: signal() })

        expect(response).toMatchObject({ outcome: 'FINDINGS-FOUND', tests: null, testsError: 'unparseable-output' })
    })

    it('reports a scan that wrote no report as not completed', async () => {
        const response = await runRequest(request, { semgrep: fakeSemgrep().semgrep, signal: signal() })

        expect(response).toMatchObject({
            outcome: 'DID-NOT-COMPLETE',
            log: 'Semgrep Scan: scan did not complete',
            error: 'semgrep-failed',
            tests: null,
        })
    })

    it('drops findings from the end until the response fits the Lambda limit', async () => {
        const results = Array.from({ length: 6000 }, (_, i) => ({
            ...finding('src/analysis.R', i + 1, 'ERROR', 'r-eval-parse'),
            extra: { severity: 'ERROR', message: 'm', lines: 'x'.repeat(1000) },
        }))
        const fake = fakeSemgrep({ report: { results, paths: { scanned: ['src/analysis.R'] } } })
        const response = await runRequest(request, { semgrep: fake.semgrep, signal: signal() })

        if (response.mode !== 'test') throw new Error('expected a test response')
        expect(response.findingsOmitted).toBeGreaterThan(0)
        expect(response.findings.length + response.findingsOmitted!).toBe(6000)
        expect(response.findings[0].start.line).toBe(1)
        expect(responseBytes(response)).toBeLessThanOrEqual(MAX_RESPONSE_BYTES)
        expect(response.log.split('\n')[0]).toBe('Semgrep Scan: findings found')
        expect(response.tests).not.toBeNull()
    })

    it('returns deadline when the signal fires during Semgrep', async () => {
        const controller = new AbortController()
        const fake = fakeSemgrep({
            report: cannedReport,
            onScan: () => {
                controller.abort()
                return { aborted: true }
            },
        })
        const response = await runRequest(request, { semgrep: fake.semgrep, signal: controller.signal })

        expect(response).toMatchObject({ outcome: 'DID-NOT-COMPLETE', error: 'deadline', tests: null })
    })
})

// SeaweedFS stands in for S3; the S3 client middleware records what the runner sends.
describe.skipIf(!s3Available)('scan mode', () => {
    const bucket = s3BucketName()
    const owner = '432772479668'
    let unique = 0

    type Sent = { command?: string; input: Record<string, unknown> }

    function s3Client({ onGetObject, extraKeys = [] }: { onGetObject?: () => void; extraKeys?: string[] } = {}) {
        const client = new S3Client({ region: 'us-east-1', forcePathStyle: true, endpoint: process.env.S3_ENDPOINT })
        const sent: Sent[] = []
        client.middlewareStack.add(
            (next, context) => async (args) => {
                const input = args.input as Record<string, unknown>
                sent.push({ command: context.commandName, input: { ...input } })
                if (context.commandName === 'GetObjectCommand') onGetObject?.()
                // SeaweedFS has no account owner; the assertions are on what the runner sends.
                delete input.ExpectedBucketOwner
                const result = await next(args)
                const output = result.output as { Contents?: { Key?: string }[] }
                if (context.commandName === 'ListObjectsV2Command' && !String(input.Prefix).startsWith('rulesets/')) {
                    output.Contents = [...(output.Contents ?? []), ...extraKeys.map((Key) => ({ Key }))]
                }
                return result
            },
            { step: 'initialize' },
        )
        return { client, sent }
    }

    async function upload(files: Record<string, string>) {
        const { client } = s3Client()
        for (const [Key, Body] of Object.entries(files)) {
            await client.send(new PutObjectCommand({ Bucket: bucket, Key, Body }))
        }
    }

    async function setup(submission: Record<string, string>, rules: Record<string, string>) {
        const id = `${Date.now()}-${++unique}`
        const prefix = `semgrep-runner-test-${id}/code`
        const version = `test-${id}`
        const ruleset = `rulesets/dev/${version}`
        await upload({
            ...Object.fromEntries(Object.entries(submission).map(([k, v]) => [`${prefix}/${k}`, v])),
            ...Object.fromEntries(Object.entries(rules).map(([k, v]) => [`${ruleset}/${k}`, v])),
        })
        const request: ScanRequest = { mode: 'scan', submission: { bucket, prefix }, rulesetVersion: version }
        return { request, prefix }
    }

    const storage = (client: S3Client): RulesetStorage => ({
        s3: client,
        rulesBucket: bucket,
        rulesetEnv: 'dev',
        rulesBucketOwner: owner,
    })

    const defaultRules = { 'rules/secrets.yaml': 'rules: []' }

    it('downloads the submission and only the rule files, and returns outcome, log and report', async () => {
        const { request } = await setup(
            { 'analysis.R': 'x <- 1', 'reports/study.Rmd': '```{r}\nx <- 1\n```\n' },
            {
                'rules/secrets.yaml': 'rules: []',
                'rules/nested/python.yml': 'rules: []',
                'rules/README.md': 'notes',
                'tests/secrets.yaml': 'not a rule',
            },
        )
        const { client, sent } = s3Client()
        const fake = fakeSemgrep({
            report: cannedReport,
            onScan: (cwd) => {
                expect(fs.readFileSync(path.join(cwd, 'src/reports/study.Rmd'), 'utf-8')).toContain('x <- 1')
                expect(fs.existsSync(path.join(cwd, 'notebooks/reports/study.Rmd.R'))).toBe(true)
                expect(fs.readdirSync(path.join(cwd, 'rules'), { recursive: true }).sort()).toEqual([
                    'nested',
                    'nested/python.yml',
                    'secrets.yaml',
                ])
            },
        })
        const response = await runRequest(request, {
            semgrep: fake.semgrep,
            signal: signal(),
            storage: storage(client),
        })

        expect(response).toMatchObject({
            mode: 'scan',
            rulesetVersion: request.rulesetVersion,
            outcome: 'FINDINGS-FOUND',
            semgrepJson: JSON.stringify(cannedReport),
        })
        expect(response.log.split('\n')[0]).toBe('Semgrep Scan: findings found')
        expect(response.log).toContain('  study.Rmd:4  ERROR    secret-github-token')
        expectLocalRulesOnly(fake.scanCall())
        expect(fs.existsSync(fake.scanCall().cwd)).toBe(false)

        const rulesCalls = sent.filter(({ input }) => String(input.Prefix ?? input.Key).startsWith('rulesets/'))
        expect(rulesCalls.map((c) => c.command)).toContain('GetObjectCommand')
        for (const { command, input } of rulesCalls) {
            expect(input.ExpectedBucketOwner).toBe(owner)
            if (command === 'ListObjectsV2Command') {
                expect(input.Prefix).toBe(rulesetRulesPrefix('dev', request.rulesetVersion))
            }
        }
    })

    it('does not run Semgrep on an empty ruleset', async () => {
        const { request } = await setup({ 'analysis.R': 'x <- 1' }, { 'tests/secrets.yaml': 'not a rule' })
        const fake = fakeSemgrep({ report: cannedReport })
        const response = await runRequest(request, {
            semgrep: fake.semgrep,
            signal: signal(),
            storage: storage(s3Client().client),
        })

        expect(response).toMatchObject({ outcome: 'DID-NOT-COMPLETE', error: 'ruleset-empty', semgrepJson: null })
        expect(response.log).toBe('Semgrep Scan: scan did not complete')
        expect(fake.calls).toHaveLength(0)
    })

    it('reports a scan that wrote no report as not completed', async () => {
        const { request } = await setup({ 'analysis.R': 'x <- 1' }, defaultRules)
        const response = await runRequest(request, {
            semgrep: fakeSemgrep().semgrep,
            signal: signal(),
            storage: storage(s3Client().client),
        })

        expect(response).toMatchObject({
            outcome: 'DID-NOT-COMPLETE',
            log: 'Semgrep Scan: scan did not complete',
            error: 'semgrep-failed',
        })
    })

    it('returns deadline without running Semgrep when the signal fired before or during the download', async () => {
        const { request } = await setup({ 'analysis.R': 'x <- 1' }, defaultRules)
        const before = new AbortController()
        before.abort()
        const during = new AbortController()
        const fake = fakeSemgrep({ report: cannedReport })

        const responses = [
            await runRequest(request, {
                semgrep: fake.semgrep,
                signal: before.signal,
                storage: storage(s3Client().client),
            }),
            await runRequest(request, {
                semgrep: fake.semgrep,
                signal: during.signal,
                storage: storage(s3Client({ onGetObject: () => during.abort() }).client),
            }),
        ]

        for (const response of responses)
            expect(response).toMatchObject({ outcome: 'DID-NOT-COMPLETE', error: 'deadline' })
        expect(fake.calls).toHaveLength(0)
    })

    it('returns deadline and ignores the report when the signal fires during Semgrep', async () => {
        const { request } = await setup({ 'analysis.R': 'x <- 1' }, defaultRules)
        const controller = new AbortController()
        const fake = fakeSemgrep({
            report: cannedReport,
            onScan: () => {
                controller.abort()
                return { aborted: true }
            },
        })
        const response = await runRequest(request, {
            semgrep: fake.semgrep,
            signal: controller.signal,
            storage: storage(s3Client().client),
        })

        expect(response).toMatchObject({ outcome: 'DID-NOT-COMPLETE', error: 'deadline', semgrepJson: null })
        expect(fs.existsSync(fake.scanCall().cwd)).toBe(false)
    })

    it('fails on a key that is both a file and a folder', async () => {
        const { request, prefix } = await setup({ 'a.R': 'x <- 1' }, defaultRules)
        const fake = fakeSemgrep({ report: cannedReport })
        const { client } = s3Client({ extraKeys: [`${prefix}/a.R/b.R`] })
        const response = await runRequest(request, {
            semgrep: fake.semgrep,
            signal: signal(),
            storage: storage(client),
        })

        expect(response).toMatchObject({ outcome: 'DID-NOT-COMPLETE', error: 'workspace-failed' })
        expect(fake.calls).toHaveLength(0)
    })

    it('fails on a key that would land outside the work dir', async () => {
        const { request, prefix } = await setup({ 'analysis.R': 'x <- 1' }, defaultRules)
        const fake = fakeSemgrep({ report: cannedReport })
        const { client } = s3Client({ extraKeys: [`${prefix}/../evil.R`] })
        const response = await runRequest(request, {
            semgrep: fake.semgrep,
            signal: signal(),
            storage: storage(client),
        })

        expect(response).toMatchObject({ outcome: 'DID-NOT-COMPLETE', error: 'unsafe-key' })
        expect(fake.calls).toHaveLength(0)
    })

    it('leaves out a report too large for the Lambda response but keeps the outcome and log', async () => {
        const { request } = await setup({ 'analysis.R': 'x <- 1' }, defaultRules)
        const big = {
            ...cannedReport,
            results: [
                { ...finding('src/analysis.R', 1), extra: { severity: 'ERROR', message: 'm', lines: 'x'.repeat(6e6) } },
            ],
        }
        const response = await runRequest(request, {
            semgrep: fakeSemgrep({ report: big }).semgrep,
            signal: signal(),
            storage: storage(s3Client().client),
        })

        expect(response).toMatchObject({
            outcome: 'FINDINGS-FOUND',
            semgrepJson: null,
            semgrepJsonOmitted: 'too-large',
        })
        expect(response.log.split('\n')[0]).toBe('Semgrep Scan: findings found')
        expect(responseBytes(response)).toBeLessThanOrEqual(MAX_RESPONSE_BYTES)
    })
})
