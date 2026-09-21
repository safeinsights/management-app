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

import { enqueueStudyReview } from './enqueue'

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
        expect(JSON.parse(sentMessage().MessageBody)).toEqual({ studyJobId: 'job-1', round: 2 })
    })

    // Local development, unit tests and PR previews each run against their own database, which the
    // shared worker cannot reach.
    it('reports nothing queued when no queue is configured', async () => {
        delete process.env.REVIEW_QUEUE_URL

        expect(await enqueueStudyReview({ studyJobId: 'job-1', round: 1 })).toBe(false)
        expect(send).not.toHaveBeenCalled()
    })

    it('reports nothing queued when the send fails, so the caller can still generate', async () => {
        process.env.REVIEW_QUEUE_URL = 'https://sqs.test/review'
        send.mockRejectedValue(new Error('queue unreachable'))

        expect(await enqueueStudyReview({ studyJobId: 'job-1', round: 1 })).toBe(false)
    })
})
