import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { mockClient } from 'aws-sdk-client-mock'

vi.mock('@/server/agents/review-agent/runner', () => ({
    generateAndStoreStudyReview: vi.fn(),
}))

import { enqueueStudyReview } from './queue'
import { generateAndStoreStudyReview } from '@/server/agents/review-agent/runner'

const sqsMock = mockClient(SQSClient)
const runnerMock = generateAndStoreStudyReview as unknown as Mock

describe('enqueueStudyReview', () => {
    const ORIGINAL_ENV = process.env

    beforeEach(() => {
        sqsMock.reset()
        runnerMock.mockReset()
        process.env = { ...ORIGINAL_ENV }
    })

    afterEach(() => {
        process.env = ORIGINAL_ENV
    })

    it('sends a SendMessageCommand to the configured queue when JOB_QUEUE_URL is set', async () => {
        process.env.JOB_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123/test-queue'
        sqsMock.on(SendMessageCommand).resolves({ MessageId: 'msg-1' })

        await enqueueStudyReview('study-job-abc')

        const calls = sqsMock.commandCalls(SendMessageCommand)
        expect(calls).toHaveLength(1)
        expect(calls[0].args[0].input.QueueUrl).toBe('https://sqs.us-east-1.amazonaws.com/123/test-queue')
        expect(JSON.parse(calls[0].args[0].input.MessageBody as string)).toEqual({
            kind: 'study-review',
            studyJobId: 'study-job-abc',
        })
        expect(runnerMock).not.toHaveBeenCalled()
    })

    it('falls back to running the job inline when JOB_QUEUE_URL is unset (local dev)', async () => {
        delete process.env.JOB_QUEUE_URL
        runnerMock.mockResolvedValue(undefined)

        await enqueueStudyReview('study-job-local')

        expect(runnerMock).toHaveBeenCalledExactlyOnceWith('study-job-local')
        expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0)
    })
})
