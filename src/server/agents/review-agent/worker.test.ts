import type { SQSEvent, SQSRecord } from 'aws-lambda'
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest'

vi.mock('./runner', async () => {
    const actual = await vi.importActual<typeof import('./runner')>('./runner')
    return { generateAndStoreStudyReview: vi.fn(), StudyReviewGenerationFailed: actual.StudyReviewGenerationFailed }
})

vi.mock('@/server/config', () => ({
    getConfigValue: vi.fn().mockResolvedValue(null),
    ENVIRONMENT_ID: 'test',
}))

import { STUDY_REVIEW_QUEUE_STALE_AFTER_MS } from '@/lib/study-review'
import { handler } from './worker'
import { generateAndStoreStudyReview, StudyReviewGenerationFailed } from './runner'

const runnerMock = generateAndStoreStudyReview as unknown as Mock

const record = (messageId: string, body: string): SQSRecord =>
    ({ messageId, body, eventSource: 'aws:sqs' }) as SQSRecord

const event = (records: SQSRecord[]): SQSEvent => ({ Records: records })

describe('review worker handler', () => {
    beforeEach(() => {
        runnerMock.mockReset()
    })

    it('generates the review named in the message and reports no failures', async () => {
        runnerMock.mockResolvedValue(undefined)

        const result = await handler(event([record('m1', JSON.stringify({ studyJobId: 'job-1', round: 2 }))]))

        expect(runnerMock).toHaveBeenCalledExactlyOnceWith('job-1', 2)
        expect(result.batchItemFailures).toEqual([])
    })

    it('drops a message it cannot read rather than redriving it forever', async () => {
        const result = await handler(
            event([record('m1', 'not json'), record('m2', JSON.stringify({ studyJobId: 'job-1' }))]),
        )

        expect(runnerMock).not.toHaveBeenCalled()
        expect(result.batchItemFailures).toEqual([])
    })

    // The reviewer already sees the failure and a Retry control; a redrive would repeat the run.
    it('does not redrive a generation whose failure was recorded', async () => {
        runnerMock.mockRejectedValue(new StudyReviewGenerationFailed('job-1', 1))

        const result = await handler(event([record('m1', JSON.stringify({ studyJobId: 'job-1', round: 1 }))]))

        expect(result.batchItemFailures).toEqual([])
    })

    it('redrives a message whose run failed before it could record anything', async () => {
        runnerMock.mockRejectedValue(new Error('database unreachable'))

        const result = await handler(event([record('m1', JSON.stringify({ studyJobId: 'job-1', round: 1 }))]))

        expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'm1' }])
    })

    // A redelivery lands a full visibility timeout later, long after the reviewer was given Retry.
    // Running it then would wipe the row they are looking at and pay for a report nobody wants.
    it('drops a message that waited longer than the reviewer would have', async () => {
        const requestedAt = new Date(Date.now() - STUDY_REVIEW_QUEUE_STALE_AFTER_MS - 1_000).toISOString()

        const result = await handler(
            event([record('m1', JSON.stringify({ studyJobId: 'job-1', round: 1, requestedAt }))]),
        )

        expect(runnerMock).not.toHaveBeenCalled()
        expect(result.batchItemFailures).toEqual([])
    })

    it('runs a message that is still inside the queue threshold', async () => {
        runnerMock.mockResolvedValue(undefined)
        const requestedAt = new Date(Date.now() - 60_000).toISOString()

        await handler(event([record('m1', JSON.stringify({ studyJobId: 'job-1', round: 1, requestedAt }))]))

        expect(runnerMock).toHaveBeenCalledExactlyOnceWith('job-1', 1)
    })

    it('reports only the records that failed, not the whole batch', async () => {
        runnerMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('database unreachable'))

        const result = await handler(
            event([
                record('m1', JSON.stringify({ studyJobId: 'job-1', round: 1 })),
                record('m2', JSON.stringify({ studyJobId: 'job-2', round: 1 })),
            ]),
        )

        expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'm2' }])
    })
})
