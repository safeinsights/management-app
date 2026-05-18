import type { SQSEvent, SQSRecord } from 'aws-lambda'
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

vi.mock('./runner', () => ({
    generateAndStoreStudyReview: vi.fn(),
}))

import { handler } from './worker'
import { generateAndStoreStudyReview } from './runner'

const runnerMock = generateAndStoreStudyReview as unknown as Mock

function record(messageId: string, body: string): SQSRecord {
    return {
        messageId,
        receiptHandle: 'rh',
        body,
        attributes: {} as SQSRecord['attributes'],
        messageAttributes: {},
        md5OfBody: '',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:us-east-1:123:JobQueue',
        awsRegion: 'us-east-1',
    }
}

function event(records: SQSRecord[]): SQSEvent {
    return { Records: records }
}

describe('review-agent worker handler', () => {
    beforeEach(() => {
        runnerMock.mockReset()
    })

    it('runs the study review for a valid message and returns no failures', async () => {
        runnerMock.mockResolvedValue(undefined)
        const result = await handler(event([record('m1', JSON.stringify({ studyJobId: 'sj-1' }))]))

        expect(runnerMock).toHaveBeenCalledExactlyOnceWith('sj-1')
        expect(result.batchItemFailures).toEqual([])
    })

    it('drops a malformed body without redriving (parse failures are not retriable)', async () => {
        const result = await handler(event([record('m-bad', 'not-json')]))

        expect(runnerMock).not.toHaveBeenCalled()
        expect(result.batchItemFailures).toEqual([])
    })

    it('drops a body missing studyJobId without redriving', async () => {
        const result = await handler(event([record('m-empty', JSON.stringify({}))]))

        expect(runnerMock).not.toHaveBeenCalled()
        expect(result.batchItemFailures).toEqual([])
    })

    it('reports a record as failed when the runner throws so SQS will redrive it', async () => {
        runnerMock.mockRejectedValue(new Error('anthropic down'))
        const result = await handler(event([record('m-fail', JSON.stringify({ studyJobId: 'sj-2' }))]))

        expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'm-fail' }])
    })

    it('only redrives the failing records in a mixed batch', async () => {
        runnerMock.mockImplementation((id: string) => {
            if (id === 'sj-fail') throw new Error('boom')
            return Promise.resolve()
        })
        const result = await handler(
            event([
                record('m-ok', JSON.stringify({ studyJobId: 'sj-ok' })),
                record('m-fail', JSON.stringify({ studyJobId: 'sj-fail' })),
            ]),
        )

        expect(runnerMock).toHaveBeenCalledTimes(2)
        expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'm-fail' }])
    })
})
