import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { actionResult, describe, expect, it, mockSessionWithTestData, vi } from '@/tests/unit.helpers'
import { stubJobQueue } from '@/tests/job-queue.helpers'
import { InvokeCommand } from '@aws-sdk/client-lambda'
import { stubRulesBucket, stubTestRunner, testResponse } from '@/tests/semgrep-rules-s3.helpers'
import { createVersion, writePointer } from '@/server/semgrep-rulesets/store'
import type { RulesetEnv } from '../../../services/semgrep-runner/protocol'
import {
    createSemgrepRulesetDraftAction,
    getSemgrepRulesetRequestAction,
    getSemgrepRulesetVersionAction,
    getUpstreamSemgrepRulesetAction,
    listSemgrepRulesetVersionsAction,
    requestSemgrepRulesetChangeAction,
    runSemgrepRulesTestAction,
} from './semgrep-ruleset.actions'

const files = [
    { path: 'rules/secrets.yaml', content: 'rules: []' },
    { path: 'tests/secrets.r', content: 'token <- "x"' },
]

describe('semgrep ruleset actions', () => {
    it('refuses both actions to a user who is not an SI admin', async () => {
        await mockSessionWithTestData({ isSiAdmin: false })
        const bucket = stubRulesBucket()
        stubJobQueue()

        expect(await createSemgrepRulesetDraftAction({ files, changeNote: 'x' })).toEqual({
            error: { permission_denied: expect.any(String) },
        })
        expect(await requestSemgrepRulesetChangeAction({ kind: 'publish', version: 'v1' })).toEqual({
            error: { permission_denied: expect.any(String) },
        })
        expect(bucket.keys()).toEqual([])
    })

    it('creates a draft version with the admin as its author', async () => {
        const { user } = await mockSessionWithTestData({ isSiAdmin: true })
        const bucket = stubRulesBucket()

        expect(actionResult(await createSemgrepRulesetDraftAction({ files, changeNote: 'first rules' }))).toEqual({
            version: 'v1',
        })
        expect(bucket.keys()).toEqual([
            'rulesets/dev/v1/rules/secrets.yaml',
            'rulesets/dev/v1/tests/secrets.r',
            'rulesets/dev/v1/version.json',
        ])
        expect(bucket.readJson('rulesets/dev/v1/version.json')).toMatchObject({
            author: { userId: user.id, name: expect.any(String) },
            changeNote: 'first rules',
            source: null,
        })
        expect(bucket.readJson('rulesets/dev/published.json')).toBeUndefined()
    })

    it('refuses a draft that is not a ruleset', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const bucket = stubRulesBucket()

        const result = await createSemgrepRulesetDraftAction({
            files: [{ path: 'tests/secrets.r', content: '' }],
            changeNote: 'no rules',
        })
        expect(result).toHaveProperty('error')
        expect(bucket.keys()).toEqual([])
    })

    it('queues the change for the JobWorker with the admin as requester', async () => {
        const { user } = await mockSessionWithTestData({ isSiAdmin: true })
        stubRulesBucket({ env: 'staging', upstreamEnv: 'dev' })
        const queue = stubJobQueue()

        const { requestId } = actionResult(
            await requestSemgrepRulesetChangeAction({ kind: 'promote', upstreamVersion: 'v5', changeNote: 'pull' }),
        )

        const messages = queue
            .commandCalls(SendMessageCommand)
            .map((call) => JSON.parse(call.args[0].input.MessageBody!))
        expect(messages).toEqual([
            {
                job: 'semgrep-ruleset-change',
                payload: {
                    kind: 'promote',
                    upstreamVersion: 'v5',
                    changeNote: 'pull',
                    requestId,
                    requestedBy: { userId: user.id, name: expect.any(String) },
                    requestedAt: expect.any(String),
                },
            },
        ])
    })

    it('refuses a change where no job queue or no runner can run the gate', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        stubRulesBucket()

        expect(await requestSemgrepRulesetChangeAction({ kind: 'rollback', version: 'v1' })).toEqual({
            error: { semgrepRuleset: 'cannot be published in this environment' },
        })

        stubJobQueue()
        vi.stubEnv('SEMGREP_RUNNER_FUNCTION_NAME', '')
        expect(await requestSemgrepRulesetChangeAction({ kind: 'rollback', version: 'v1' })).toEqual({
            error: { semgrepRuleset: 'cannot be published in this environment' },
        })
    })

    it('reports a store that is not configured', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        expect(await createSemgrepRulesetDraftAction({ files, changeNote: 'x' })).toEqual({
            error: { semgrepRuleset: 'is not configured in this environment' },
        })
    })
})

const author = { userId: null, name: 'Seed' }

const seedVersion = (env: RulesetEnv, changeNote: string) =>
    createVersion({ env, files, changeNote, author, source: null })

const publish = (env: RulesetEnv, version: string) =>
    writePointer(
        env,
        {
            schemaVersion: 1,
            version,
            publishedAt: new Date().toISOString(),
            publishedBy: author,
            kind: 'publish',
            previousVersion: null,
            requestId: crypto.randomUUID(),
        },
        null,
    )

describe('semgrep ruleset read actions', () => {
    it('refuses a user who is not an SI admin', async () => {
        await mockSessionWithTestData({ isSiAdmin: false })
        stubRulesBucket()

        const denied = { error: { permission_denied: expect.any(String) } }
        expect(await listSemgrepRulesetVersionsAction()).toEqual(denied)
        expect(await getSemgrepRulesetVersionAction({ version: 'v1' })).toEqual(denied)
        expect(await getUpstreamSemgrepRulesetAction()).toEqual(denied)
        expect(await runSemgrepRulesTestAction({ files, scratchFiles: [] })).toEqual(denied)
    })

    it('lists the versions newest first with the published pointer', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        stubRulesBucket({ env: 'staging', upstreamEnv: 'dev' })
        await seedVersion('staging', 'first')
        await seedVersion('staging', 'second')
        await publish('staging', 'v1')

        const result = actionResult(await listSemgrepRulesetVersionsAction())
        expect(result).toMatchObject({
            env: 'staging',
            upstreamEnv: 'dev',
            canRunTests: true,
            published: { version: 'v1' },
        })
        expect(result.versions.map((v) => [v.version, v.changeNote])).toEqual([
            ['v2', 'second'],
            ['v1', 'first'],
        ])
    })

    it('reads a version with its files, and reports one that does not exist', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        stubRulesBucket()
        await seedVersion('dev', 'first')

        expect(actionResult(await getSemgrepRulesetVersionAction({ version: 'v1' }))).toMatchObject({
            manifest: { version: 'v1', changeNote: 'first' },
            files,
        })
        expect(await getSemgrepRulesetVersionAction({ version: 'v7' })).toEqual({
            error: { version: 'does not exist' },
        })
    })

    it("reads the upstream environment's published version", async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        stubRulesBucket({ env: 'staging', upstreamEnv: 'dev' })
        expect(actionResult(await getUpstreamSemgrepRulesetAction())).toBeNull()

        await seedVersion('dev', 'one')
        await seedVersion('dev', 'two')
        await publish('dev', 'v2')

        expect(actionResult(await getUpstreamSemgrepRulesetAction())).toMatchObject({
            env: 'dev',
            pointer: { version: 'v2' },
            manifest: { version: 'v2', changeNote: 'two' },
            files,
        })
    })

    it('reads a change request record, or null before the job claims it', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const bucket = stubRulesBucket()
        const requestId = crypto.randomUUID()
        expect(actionResult(await getSemgrepRulesetRequestAction({ requestId }))).toBeNull()

        const record = {
            requestId,
            kind: 'publish',
            targetVersion: 'v1',
            upstreamVersion: null,
            requestedBy: author,
            requestedAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
            finishedAt: null,
            status: 'running',
            reason: null,
            gate: null,
        }
        bucket.put(`rulesets/dev/requests/${requestId}.json`, JSON.stringify(record))
        expect(actionResult(await getSemgrepRulesetRequestAction({ requestId }))).toEqual(record)
    })
})

describe('runSemgrepRulesTestAction', () => {
    it('runs the draft rules on the fixtures and scratch files', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        stubRulesBucket()
        const reply = testResponse({
            outcome: 'FINDINGS-FOUND',
            findings: [
                {
                    check_id: 'rules.secrets',
                    path: '_scratch/mine.r',
                    start: { line: 1 },
                    extra: { severity: 'ERROR', message: 'secret' },
                },
            ],
        })
        const lambda = stubTestRunner(() => reply)

        const result = await runSemgrepRulesTestAction({
            files,
            scratchFiles: [{ name: 'mine.r', content: 'token <- "x"' }],
        })

        expect(actionResult(result)).toEqual(reply)
        expect(JSON.parse(String(lambda.commandCalls(InvokeCommand)[0].args[0].input.Payload))).toEqual({
            mode: 'test',
            rules: [{ path: 'secrets.yaml', content: 'rules: []' }],
            files: [
                { path: 'secrets.r', content: 'token <- "x"' },
                { path: '_scratch/mine.r', content: 'token <- "x"' },
            ],
        })
    })

    it('reports a runner failure', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        stubRulesBucket()
        stubTestRunner(() => ({ functionError: 'boom' }))

        expect(await runSemgrepRulesTestAction({ files, scratchFiles: [] })).toEqual({
            error: { semgrepRuleset: 'test run failed (runner-failed)' },
        })
    })

    it('refuses a run where no runner is configured, or with nothing to scan', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        stubRulesBucket({ env: 'dev', runner: false })

        expect(await runSemgrepRulesTestAction({ files, scratchFiles: [] })).toEqual({
            error: { semgrepRuleset: 'cannot run tests in this environment' },
        })
        expect(
            await runSemgrepRulesTestAction({ files: [{ path: 'rules/a.yaml', content: '' }], scratchFiles: [] }),
        ).toHaveProperty('error')
    })
})
