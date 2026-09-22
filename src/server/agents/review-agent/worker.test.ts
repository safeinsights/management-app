import type { SQSEvent, SQSRecord } from 'aws-lambda'
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest'

vi.mock('./runner', () => ({ generateAndStoreStudyReview: vi.fn() }))

vi.mock('@/server/config', () => ({
    getConfigValue: vi.fn().mockResolvedValue(null),
    ENVIRONMENT_ID: 'test',
}))

import { handler } from './worker'
import { generateAndStoreStudyReview } from './runner'

const runnerMock = generateAndStoreStudyReview as unknown as Mock

const record = (messageId: string, body: string): SQSRecord =>
    ({ messageId, body, eventSource: 'aws:sqs' }) as SQSRecord

const event = (records: SQSRecord[]): SQSEvent => ({ Records: records })

describe('review worker handler', () => {
    beforeEach(() => {
        runnerMock.mockReset()
    })

    it('generates the review named in the message', async () => {
        runnerMock.mockResolvedValue(undefined)

        await handler(event([record('m1', JSON.stringify({ studyJobId: 'job-1', round: 2 }))]))

        expect(runnerMock).toHaveBeenCalledExactlyOnceWith('job-1', 2)
    })

    it('drops a message it cannot read rather than redriving it', async () => {
        await expect(
            handler(event([record('m1', 'not json'), record('m2', JSON.stringify({ studyJobId: 'job-1' }))])),
        ).resolves.toBeUndefined()

        expect(runnerMock).not.toHaveBeenCalled()
    })

    // The reviewer gets Retry from the row long before SQS would redeliver, so a failed run must not
    // come back an hour later and run again.
    it('does not hand a failed run back to the queue', async () => {
        runnerMock.mockRejectedValue(new Error('model exploded'))

        await expect(
            handler(event([record('m1', JSON.stringify({ studyJobId: 'job-1', round: 1 }))])),
        ).resolves.toBeUndefined()
    })
})
