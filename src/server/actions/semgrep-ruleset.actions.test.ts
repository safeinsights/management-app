import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { actionResult, describe, expect, it, mockSessionWithTestData, vi } from '@/tests/unit.helpers'
import { stubJobQueue } from '@/tests/job-queue.helpers'
import { stubRulesBucket } from '@/tests/semgrep-rules-s3.helpers'
import { createSemgrepRulesetDraftAction, requestSemgrepRulesetChangeAction } from './semgrep-ruleset.actions'

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
