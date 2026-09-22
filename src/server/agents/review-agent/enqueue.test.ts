import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import { mockClient } from 'aws-sdk-client-mock'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enqueueStudyReview, isStudyReviewQueueConfigured } from './enqueue'

const sqsMock = mockClient(SQSClient)

const originalQueueUrl = process.env.REVIEW_QUEUE_URL

describe('enqueueStudyReview', () => {
    beforeEach(() => {
        sqsMock.reset()
        sqsMock.on(SendMessageCommand).resolves({})
    })

    afterEach(() => {
        if (originalQueueUrl == null) delete process.env.REVIEW_QUEUE_URL
        else process.env.REVIEW_QUEUE_URL = originalQueueUrl
    })

    it('sends the job and its round to the configured queue', async () => {
        process.env.REVIEW_QUEUE_URL = 'https://sqs.test/review'

        await enqueueStudyReview({ studyJobId: 'job-1', round: 2 })

        const input = sqsMock.commandCalls(SendMessageCommand)[0].args[0].input
        expect(input.QueueUrl).toBe('https://sqs.test/review')
        expect(JSON.parse(input.MessageBody!)).toEqual({ studyJobId: 'job-1', round: 2 })
    })

    it('rejects when the send fails, so the caller reports it', async () => {
        process.env.REVIEW_QUEUE_URL = 'https://sqs.test/review'
        sqsMock.on(SendMessageCommand).rejects(new Error('queue unreachable'))

        await expect(enqueueStudyReview({ studyJobId: 'job-1', round: 1 })).rejects.toThrow('queue unreachable')
    })
})

describe('isStudyReviewQueueConfigured', () => {
    it('is false without a queue url, which is what selects the in-process path', () => {
        delete process.env.REVIEW_QUEUE_URL
        expect(isStudyReviewQueueConfigured()).toBe(false)

        process.env.REVIEW_QUEUE_URL = 'https://sqs.test/review'
        expect(isStudyReviewQueueConfigured()).toBe(true)
    })
})
