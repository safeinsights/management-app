import { PutObjectCommand } from '@aws-sdk/client-s3'
import { InvokeCommand } from '@aws-sdk/client-lambda'
import { describe, expect, it } from '@/tests/unit.helpers'
import {
    passingGate,
    stubRulesBucket,
    stubRulesetEnv,
    stubRunner,
    type RunnerReply,
} from '@/tests/semgrep-rules-s3.helpers'
import type { RulesetPointer, RulesetRequest } from '@/lib/semgrep-rulesets/schemas'
import { runJob } from '@/server/jobs/registry'
import type { GateResponse, RulesetEnv, RulesetPerson } from '../../../services/semgrep-runner/protocol'
import type { SemgrepRulesetChangePayload } from './change'
import { createVersion } from './store'

const requester: RulesetPerson = { userId: '0195f1a4-6b52-7a3c-9e21-3f4d5c6b7a80', name: 'Ada Admin' }
const files = [
    { path: 'rules/secrets.yaml', content: 'rules:\n  - id: secret\n' },
    { path: 'tests/secrets.r', content: '# ruleid: secret\ntoken <- "x"\n' },
    { path: 'tests/corpus/analysis.R', content: 'mean(x)\n' },
]

type Bucket = ReturnType<typeof stubRulesBucket>

const failingGate = (rulesetVersion: string): GateResponse => ({
    mode: 'gate',
    rulesetVersion,
    passed: false,
    checks: [
        { name: 'integrity', passed: true, failures: [] },
        { name: 'rules', passed: true, failures: [] },
        {
            name: 'fixtures',
            passed: false,
            failures: ['rules/secrets.yaml: secret failed (expected lines 2, reported none)'],
        },
        { name: 'coverage', passed: true, failures: [] },
    ],
})

async function createVersions(env: RulesetEnv, count: number) {
    for (let i = 0; i < count; i++) {
        await createVersion({ env, files, changeNote: `change ${i + 1}`, author: requester, source: null })
    }
}

// Publishes as an earlier request did, outside the job under test.
function markPublished(bucket: Bucket, env: RulesetEnv, version: string) {
    const pointer: RulesetPointer = {
        schemaVersion: 1,
        version,
        publishedAt: new Date().toISOString(),
        publishedBy: requester,
        kind: 'publish',
        previousVersion: null,
        requestId: crypto.randomUUID(),
    }
    return bucket.put(`rulesets/${env}/published.json`, JSON.stringify(pointer))
}

type ChangeFields =
    | { kind: 'publish' | 'rollback'; version: string }
    | { kind: 'promote'; upstreamVersion: string; changeNote?: string }

function change(fields: ChangeFields, requestedBy: RulesetPerson = requester): SemgrepRulesetChangePayload {
    return { requestId: crypto.randomUUID(), requestedBy, requestedAt: new Date().toISOString(), ...fields }
}

const run = (payload: SemgrepRulesetChangePayload) => runJob({ job: 'semgrep-ruleset-change', payload })

const pointerOf = (bucket: Bucket, env: RulesetEnv) => bucket.readJson<RulesetPointer>(`rulesets/${env}/published.json`)
const requestOf = (bucket: Bucket, env: RulesetEnv, payload: SemgrepRulesetChangePayload) =>
    bucket.readJson<RulesetRequest>(`rulesets/${env}/requests/${payload.requestId}.json`)
const pointerWrites = (bucket: Bucket) =>
    bucket.s3
        .commandCalls(PutObjectCommand)
        .map((call) => call.args[0].input)
        .filter((input) => input.Key?.endsWith('/published.json'))
const gateCalls = (lambda: ReturnType<typeof stubRunner>) =>
    lambda.commandCalls(InvokeCommand).map((call) => JSON.parse(String(call.args[0].input.Payload)).rulesetVersion)

describe('publish', () => {
    it('publishes the first version after the gate passes', async () => {
        const bucket = stubRulesBucket()
        const lambda = stubRunner()
        await createVersions('dev', 1)
        const payload = change({ kind: 'publish', version: 'v1' })
        await run(payload)

        expect(gateCalls(lambda)).toEqual(['v1'])
        expect(pointerWrites(bucket)).toEqual([expect.objectContaining({ IfNoneMatch: '*' })])
        expect(pointerOf(bucket, 'dev')).toEqual({
            schemaVersion: 1,
            version: 'v1',
            publishedAt: expect.any(String),
            publishedBy: requester,
            kind: 'publish',
            previousVersion: null,
            requestId: payload.requestId,
        })
        expect(requestOf(bucket, 'dev', payload)).toMatchObject({
            status: 'published',
            reason: null,
            targetVersion: 'v1',
            requestedBy: requester,
            finishedAt: expect.any(String),
            gate: passingGate('v1'),
        })
    })

    it('publishes a newer version with a write conditioned on the pointer it read', async () => {
        const bucket = stubRulesBucket()
        stubRunner()
        await createVersions('dev', 2)
        const etag = markPublished(bucket, 'dev', 'v1')
        await run(change({ kind: 'publish', version: 'v2' }))

        expect(pointerWrites(bucket)).toEqual([expect.objectContaining({ IfMatch: etag })])
        expect(pointerOf(bucket, 'dev')).toMatchObject({ version: 'v2', previousVersion: 'v1', kind: 'publish' })
    })

    it.each([
        ['an older version', 'v1', 'not newer than the published version'],
        ['the published version', 'v2', 'already published'],
        ['an unknown version', 'v7', 'unknown version'],
    ])('refuses %s without running the gate', async (_, version, reason) => {
        const bucket = stubRulesBucket()
        const lambda = stubRunner()
        await createVersions('dev', 2)
        markPublished(bucket, 'dev', 'v2')
        const payload = change({ kind: 'publish', version })
        await run(payload)

        expect(requestOf(bucket, 'dev', payload)).toMatchObject({ status: 'invalid', reason, gate: null })
        expect(gateCalls(lambda)).toEqual([])
        expect(pointerOf(bucket, 'dev')?.version).toBe('v2')
    })

    it('lets a requester without a user id publish and keeps the null in the pointer', async () => {
        const bucket = stubRulesBucket()
        stubRunner()
        await createVersions('dev', 1)
        const seed = { userId: null, name: 'Ruleset seed' }
        await run(change({ kind: 'publish', version: 'v1' }, seed))

        expect(pointerOf(bucket, 'dev')?.publishedBy).toEqual(seed)
    })
})

describe('gate failure', () => {
    it('keeps the pointer and records the failing checks', async () => {
        const bucket = stubRulesBucket()
        stubRunner(failingGate)
        await createVersions('dev', 2)
        markPublished(bucket, 'dev', 'v1')
        const payload = change({ kind: 'publish', version: 'v2' })
        await run(payload)

        expect(pointerOf(bucket, 'dev')?.version).toBe('v1')
        expect(pointerWrites(bucket)).toEqual([])
        expect(requestOf(bucket, 'dev', payload)).toMatchObject({ status: 'gate-failed', gate: failingGate('v2') })
    })

    it.each<[string, RunnerReply, string]>([
        ['a runner function error', { functionError: 'Runtime.ExitError' }, 'runner-failed'],
        ['a response that is not a gate response', { payload: 'null' }, 'runner-response-invalid'],
    ])('records %s as an error and keeps the pointer', async (_, reply, reason) => {
        const bucket = stubRulesBucket()
        stubRunner(() => reply)
        await createVersions('dev', 1)
        const payload = change({ kind: 'publish', version: 'v1' })

        await expect(run(payload)).rejects.toMatchObject({ code: reason })
        expect(pointerOf(bucket, 'dev')).toBeUndefined()
        expect(requestOf(bucket, 'dev', payload)).toMatchObject({ status: 'error', reason, targetVersion: 'v1' })
    })

    it('records an error without calling a runner when none is configured', async () => {
        const bucket = stubRulesBucket({ env: 'dev', runner: false })
        const lambda = stubRunner()
        await createVersions('dev', 1)
        const payload = change({ kind: 'publish', version: 'v1' })
        await run(payload)

        expect(requestOf(bucket, 'dev', payload)).toMatchObject({ status: 'error', reason: 'runner-not-configured' })
        expect(gateCalls(lambda)).toEqual([])
        expect(pointerOf(bucket, 'dev')).toBeUndefined()
    })
})

describe('rollback', () => {
    it('points to an older version after the gate passes on it again', async () => {
        const bucket = stubRulesBucket()
        const lambda = stubRunner()
        await createVersions('dev', 4)
        const etag = markPublished(bucket, 'dev', 'v3')
        const payload = change({ kind: 'rollback', version: 'v2' })
        await run(payload)

        expect(gateCalls(lambda)).toEqual(['v2'])
        expect(pointerWrites(bucket)).toEqual([expect.objectContaining({ IfMatch: etag })])
        expect(pointerOf(bucket, 'dev')).toMatchObject({ version: 'v2', kind: 'rollback', previousVersion: 'v3' })
        expect(requestOf(bucket, 'dev', payload)?.status).toBe('published')
    })

    it.each([
        ['a newer version', 'v4', 'not older than the published version'],
        ['the published version', 'v3', 'already published'],
        ['an unknown version', 'v9', 'unknown version'],
    ])('refuses %s without running the gate', async (_, version, reason) => {
        const bucket = stubRulesBucket()
        const lambda = stubRunner()
        await createVersions('dev', 4)
        markPublished(bucket, 'dev', 'v3')
        const payload = change({ kind: 'rollback', version })
        await run(payload)

        expect(requestOf(bucket, 'dev', payload)).toMatchObject({ status: 'invalid', reason })
        expect(gateCalls(lambda)).toEqual([])
        expect(pointerOf(bucket, 'dev')?.version).toBe('v3')
    })

    it('refuses a rollback when nothing is published', async () => {
        const bucket = stubRulesBucket()
        stubRunner()
        await createVersions('dev', 1)
        const payload = change({ kind: 'rollback', version: 'v1' })
        await run(payload)

        expect(requestOf(bucket, 'dev', payload)).toMatchObject({ status: 'invalid', reason: 'nothing is published' })
    })
})

describe('promotion', () => {
    it('pulls Dev into Staging and Staging into Production, and gates each copy in its own environment', async () => {
        const bucket = stubRulesBucket({ env: 'dev' })
        const lambda = stubRunner()
        await createVersions('dev', 5)
        markPublished(bucket, 'dev', 'v5')
        await createVersions('staging', 2)

        stubRulesetEnv({ env: 'staging', upstreamEnv: 'dev' })
        const toStaging = change({ kind: 'promote', upstreamVersion: 'v5', changeNote: 'secrets rule' })
        await run(toStaging)

        expect(gateCalls(lambda)).toEqual(['v3'])
        expect(bucket.readJson('rulesets/staging/v3/version.json')).toMatchObject({
            source: { env: 'dev', version: 'v5' },
            author: requester,
            changeNote: 'Promoted from dev v5: secrets rule',
            files: files.map((file) => file.path),
        })
        for (const file of files) {
            expect(bucket.read(`rulesets/staging/v3/${file.path}`)).toBe(bucket.read(`rulesets/dev/v5/${file.path}`))
        }
        expect(pointerOf(bucket, 'staging')).toMatchObject({ version: 'v3', kind: 'promote', previousVersion: null })
        expect(requestOf(bucket, 'staging', toStaging)).toMatchObject({
            status: 'published',
            targetVersion: 'v3',
            upstreamVersion: 'v5',
        })

        stubRulesetEnv({ env: 'production', upstreamEnv: 'staging' })
        await run(change({ kind: 'promote', upstreamVersion: 'v3' }))

        expect(gateCalls(lambda)).toEqual(['v3', 'v1'])
        expect(bucket.readJson('rulesets/production/v1/version.json')).toMatchObject({
            source: { env: 'staging', version: 'v3' },
            changeNote: 'Promoted from staging v3',
        })
        expect(pointerOf(bucket, 'production')).toMatchObject({ version: 'v1', kind: 'promote' })
    })

    it('lets Sandbox pull from Production', async () => {
        const bucket = stubRulesBucket({ env: 'production' })
        stubRunner()
        await createVersions('production', 1)
        markPublished(bucket, 'production', 'v1')

        stubRulesetEnv({ env: 'sandbox', upstreamEnv: 'production' })
        await run(change({ kind: 'promote', upstreamVersion: 'v1' }))

        expect(pointerOf(bucket, 'sandbox')).toMatchObject({ version: 'v1', kind: 'promote' })
        expect(bucket.readJson('rulesets/sandbox/v1/version.json')).toMatchObject({
            source: { env: 'production', version: 'v1' },
        })
    })

    it.each<[string, RulesetEnv | undefined, string | null, string, string]>([
        ['the upstream published version moved', 'dev', 'v2', 'conflict', 'upstream published version changed'],
        ['the upstream has nothing published', 'dev', null, 'invalid', 'upstream has no published version'],
        ['the environment has no upstream', undefined, 'v1', 'invalid', 'no upstream for staging'],
    ])('refuses when %s and creates no local version', async (_, upstreamEnv, upstreamPublished, status, reason) => {
        const bucket = stubRulesBucket({ env: 'dev' })
        const lambda = stubRunner()
        await createVersions('dev', 2)
        if (upstreamPublished) markPublished(bucket, 'dev', upstreamPublished)

        stubRulesetEnv({ env: 'staging', upstreamEnv })
        const payload = change({ kind: 'promote', upstreamVersion: 'v1' })
        await run(payload)

        expect(requestOf(bucket, 'staging', payload)).toMatchObject({ status, reason, targetVersion: null })
        expect(bucket.keys('rulesets/staging/v')).toEqual([])
        expect(gateCalls(lambda)).toEqual([])
    })

    it('refuses a promotion in Dev, which has no upstream', async () => {
        const bucket = stubRulesBucket({ env: 'dev' })
        stubRunner()
        const payload = change({ kind: 'promote', upstreamVersion: 'v1' })
        await run(payload)

        expect(requestOf(bucket, 'dev', payload)).toMatchObject({ status: 'invalid', reason: 'no upstream for dev' })
    })

    it('keeps the pointer when the gate fails on the promoted copy', async () => {
        const bucket = stubRulesBucket({ env: 'dev' })
        stubRunner(failingGate)
        await createVersions('dev', 1)
        markPublished(bucket, 'dev', 'v1')

        stubRulesetEnv({ env: 'staging', upstreamEnv: 'dev' })
        const payload = change({ kind: 'promote', upstreamVersion: 'v1' })
        await run(payload)

        expect(pointerOf(bucket, 'staging')).toBeUndefined()
        expect(requestOf(bucket, 'staging', payload)).toMatchObject({
            status: 'gate-failed',
            targetVersion: 'v1',
            gate: failingGate('v1'),
        })
    })

    it('creates no local version when no runner is configured', async () => {
        const bucket = stubRulesBucket({ env: 'dev' })
        await createVersions('dev', 1)
        markPublished(bucket, 'dev', 'v1')

        stubRulesetEnv({ env: 'staging', upstreamEnv: 'dev', runner: false })
        const payload = change({ kind: 'promote', upstreamVersion: 'v1' })
        await run(payload)

        expect(requestOf(bucket, 'staging', payload)).toMatchObject({
            status: 'error',
            reason: 'runner-not-configured',
        })
        expect(bucket.keys('rulesets/staging/v')).toEqual([])
    })
})

describe('concurrency', () => {
    it('reports a conflict when another request moved the pointer during the gate', async () => {
        const bucket = stubRulesBucket()
        await createVersions('dev', 3)
        markPublished(bucket, 'dev', 'v1')
        stubRunner((version) => {
            markPublished(bucket, 'dev', 'v3')
            return passingGate(version)
        })
        const payload = change({ kind: 'publish', version: 'v2' })
        await run(payload)

        expect(requestOf(bucket, 'dev', payload)).toMatchObject({
            status: 'conflict',
            reason: 'published version changed during the request',
            gate: passingGate('v2'),
        })
        expect(pointerOf(bucket, 'dev')?.version).toBe('v3')
    })

    it('runs a message delivered twice only once', async () => {
        const bucket = stubRulesBucket()
        const lambda = stubRunner()
        await createVersions('dev', 1)
        const payload = change({ kind: 'publish', version: 'v1' })
        await run(payload)
        await run(payload)

        expect(gateCalls(lambda)).toEqual(['v1'])
        expect(pointerWrites(bucket)).toHaveLength(1)
        expect(requestOf(bucket, 'dev', payload)?.status).toBe('published')
    })
})
