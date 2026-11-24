import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { InvokeCommand, LambdaClient, type InvokeCommandOutput } from '@aws-sdk/client-lambda'
import { mockClient } from 'aws-sdk-client-mock'
import { onTestFinished, vi } from 'vitest'
import type { GateResponse, RulesetEnv, TestRequest, TestResponse } from '../services/semgrep-runner/protocol'

// Kept out of unit.helpers so the AWS mocks only load for suites that use the rules bucket.

export const RULES_BUCKET = 'si-semgrep-rules'
export const RULES_BUCKET_OWNER = '432772479668'
export const RUNNER_FUNCTION = 'MgmntAppSemgrepRunner-test'

type StoredObject = { body: string; etag: string }

const s3Error = (status: number, name: string) =>
    Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } })

export type RulesetEnvConfig = { env: RulesetEnv; upstreamEnv?: RulesetEnv; runner?: boolean }

// Points the ruleset store at an environment, as the iac stack does for each app Lambda and JobWorker.
export function stubRulesetEnv({ env, upstreamEnv, runner = true }: RulesetEnvConfig) {
    vi.stubEnv('SEMGREP_RULES_BUCKET', RULES_BUCKET)
    vi.stubEnv('SEMGREP_RULES_BUCKET_OWNER', RULES_BUCKET_OWNER)
    vi.stubEnv('SEMGREP_RULESET_ENV', env)
    vi.stubEnv('SEMGREP_RULESET_UPSTREAM_ENV', upstreamEnv ?? '')
    vi.stubEnv('SEMGREP_RUNNER_FUNCTION_NAME', runner ? RUNNER_FUNCTION : '')
    onTestFinished(() => {
        vi.unstubAllEnvs()
    })
}

/**
 * An in-memory rules bucket behind a mocked S3 client. Conditional writes behave like S3: If-None-Match
 * fails on an existing key and If-Match on a changed one, both with HTTP 412.
 */
export function stubRulesBucket(config: RulesetEnvConfig = { env: 'dev' }) {
    const objects = new Map<string, StoredObject>()
    let etags = 0
    const store = (key: string, body: string) => {
        const etag = `"etag-${++etags}"`
        objects.set(key, { body, etag })
        return etag
    }

    const s3 = mockClient(S3Client)
    s3.on(ListObjectsV2Command).callsFake(({ Prefix = '', Delimiter }) => {
        const keys = [...objects.keys()].filter((key) => key.startsWith(Prefix)).sort()
        if (!Delimiter) return { Contents: keys.map((Key) => ({ Key })) }
        const direct = keys.filter((key) => !key.slice(Prefix.length).includes(Delimiter))
        const folders = new Set(
            keys
                .filter((key) => key.slice(Prefix.length).includes(Delimiter))
                .map((key) => key.slice(0, key.indexOf(Delimiter, Prefix.length) + 1)),
        )
        return { Contents: direct.map((Key) => ({ Key })), CommonPrefixes: [...folders].map((Prefix) => ({ Prefix })) }
    })
    s3.on(GetObjectCommand).callsFake(({ Key }) => {
        const object = objects.get(Key)
        if (!object) throw s3Error(404, 'NoSuchKey')
        return { ETag: object.etag, Body: { transformToString: async () => object.body } }
    })
    s3.on(PutObjectCommand).callsFake(({ Key, Body, IfNoneMatch, IfMatch }) => {
        const existing = objects.get(Key)
        if (IfNoneMatch === '*' && existing) throw s3Error(412, 'PreconditionFailed')
        if (IfMatch !== undefined && existing?.etag !== IfMatch) throw s3Error(412, 'PreconditionFailed')
        return { ETag: store(Key, String(Body)) }
    })

    stubRulesetEnv(config)
    onTestFinished(() => s3.restore())

    return {
        s3,
        objects,
        // Writes as another client would, outside the code under test.
        put: store,
        read: (key: string) => objects.get(key)?.body,
        readJson: <T = unknown>(key: string) => {
            const body = objects.get(key)?.body
            return body === undefined ? undefined : (JSON.parse(body) as T)
        },
        keys: (prefix = '') => [...objects.keys()].filter((key) => key.startsWith(prefix)).sort(),
    }
}

export type RunnerReply = GateResponse | { functionError: string } | { payload: string }

export const passingGate = (rulesetVersion: string): GateResponse => ({
    mode: 'gate',
    rulesetVersion,
    passed: true,
    checks: (['integrity', 'rules', 'fixtures', 'coverage'] as const).map((name) => ({
        name,
        passed: true,
        failures: [],
    })),
})

const payload = (text: string) => new TextEncoder().encode(text) as InvokeCommandOutput['Payload']

// The Semgrep runner Lambda: answers each gate invoke with reply(version), a passing gate by default.
export function stubRunner(reply: (version: string) => RunnerReply | Promise<RunnerReply> = passingGate) {
    const lambda = mockClient(LambdaClient)
    lambda.on(InvokeCommand).callsFake(async ({ Payload }) => {
        const text = typeof Payload === 'string' ? Payload : new TextDecoder().decode(Payload)
        const { rulesetVersion } = JSON.parse(text) as { rulesetVersion: string }
        const answer = await reply(rulesetVersion)
        if ('functionError' in answer) {
            return {
                FunctionError: 'Unhandled',
                Payload: payload(JSON.stringify({ errorMessage: answer.functionError })),
            }
        }
        return { Payload: payload('payload' in answer ? answer.payload : JSON.stringify(answer)) }
    })
    onTestFinished(() => lambda.restore())
    return lambda
}

export const testResponse = (overrides: Partial<TestResponse> = {}): TestResponse => ({
    mode: 'test',
    outcome: 'NO-FINDINGS',
    log: 'Semgrep Scan: no findings',
    findings: [],
    errors: [],
    tests: null,
    ...overrides,
})

// The Semgrep runner Lambda in test mode: answers each invoke with reply(request).
export function stubTestRunner(
    reply: (request: TestRequest) => TestResponse | { functionError: string } = () => testResponse(),
) {
    const lambda = mockClient(LambdaClient)
    lambda.on(InvokeCommand).callsFake(async ({ Payload }) => {
        const text = typeof Payload === 'string' ? Payload : new TextDecoder().decode(Payload)
        const answer = reply(JSON.parse(text) as TestRequest)
        if ('functionError' in answer) return { FunctionError: 'Unhandled', Payload: payload('{}') }
        return { Payload: payload(JSON.stringify(answer)) }
    })
    onTestFinished(() => lambda.restore())
    return lambda
}
