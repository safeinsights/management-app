import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()

vi.mock('@aws-sdk/client-sqs', () => ({
    SQSClient: class {
        send = send
    },
    SendMessageCommand: class {
        constructor(readonly input: { QueueUrl: string; MessageBody: string }) {}
    },
}))

import { enqueueStudyReview, isStudyReviewQueueConfigured } from './enqueue'

const originalQueueUrl = process.env.REVIEW_QUEUE_URL
const sentMessage = () => send.mock.calls[0][0].input as { QueueUrl: string; MessageBody: string }

describe('enqueueStudyReview', () => {
    beforeEach(() => {
        send.mockReset().mockResolvedValue({})
    })

    afterEach(() => {
        if (originalQueueUrl == null) delete process.env.REVIEW_QUEUE_URL
        else process.env.REVIEW_QUEUE_URL = originalQueueUrl
    })

    it('sends the job and its round to the configured queue', async () => {
        process.env.REVIEW_QUEUE_URL = 'https://sqs.test/review'

        expect(await enqueueStudyReview({ studyJobId: 'job-1', round: 2 })).toBe(true)

        expect(sentMessage().QueueUrl).toBe('https://sqs.test/review')
        expect(JSON.parse(sentMessage().MessageBody)).toMatchObject({ studyJobId: 'job-1', round: 2 })
    })

    // The worker drops a message that waited longer than the reviewer did, so it has to be able to
    // tell how long that was.
    it('stamps the message with when the review was requested', async () => {
        process.env.REVIEW_QUEUE_URL = 'https://sqs.test/review'

        await enqueueStudyReview({ studyJobId: 'job-1', round: 1 })

        const { requestedAt } = JSON.parse(sentMessage().MessageBody)
        expect(Date.now() - new Date(requestedAt).getTime()).toBeLessThan(5_000)
    })

    // Local development, unit tests and PR previews each run against their own database, which the
    // shared worker cannot reach.
    it('reports nothing queued when no queue is configured', async () => {
        delete process.env.REVIEW_QUEUE_URL

        expect(await enqueueStudyReview({ studyJobId: 'job-1', round: 1 })).toBe(false)
        expect(send).not.toHaveBeenCalled()
    })

    it('reports nothing queued when the send fails, so the caller can record that', async () => {
        process.env.REVIEW_QUEUE_URL = 'https://sqs.test/review'
        send.mockRejectedValue(new Error('queue unreachable'))

        expect(await enqueueStudyReview({ studyJobId: 'job-1', round: 1 })).toBe(false)
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
