import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import { mockClient } from 'aws-sdk-client-mock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enqueueJob, isJobQueueConfigured } from './queue'

const sqsMock = mockClient(SQSClient)

describe('enqueueJob', () => {
    beforeEach(() => {
        sqsMock.reset()
        sqsMock.on(SendMessageCommand).resolves({})
        vi.stubEnv('JOB_QUEUE_URL', 'https://sqs.test/jobs')
    })

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('sends the job name and its payload to the configured queue', async () => {
        await enqueueJob({ job: 'study-review', payload: { studyJobId: 'job-1', round: 2 } })

        const input = sqsMock.commandCalls(SendMessageCommand)[0].args[0].input
        expect(input.QueueUrl).toBe('https://sqs.test/jobs')
        expect(JSON.parse(input.MessageBody!)).toEqual({
            job: 'study-review',
            payload: { studyJobId: 'job-1', round: 2 },
        })
    })

    it('rejects when the send fails, so the caller reports it', async () => {
        sqsMock.on(SendMessageCommand).rejects(new Error('queue unreachable'))

        await expect(enqueueJob({ job: 'study-review', payload: { studyJobId: 'job-1', round: 1 } })).rejects.toThrow(
            'queue unreachable',
        )
    })
})

describe('isJobQueueConfigured', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('is false without a queue url, which is what selects the in-process path', () => {
        vi.stubEnv('JOB_QUEUE_URL', '')
        expect(isJobQueueConfigured()).toBe(false)

        vi.stubEnv('JOB_QUEUE_URL', 'https://sqs.test/jobs')
        expect(isJobQueueConfigured()).toBe(true)
    })
})
