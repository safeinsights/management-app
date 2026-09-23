import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, insertTestStudyJobData } from '@/tests/unit.helpers'
import type { AnalysisReport } from '@/server/agents/review-agent/types'
import { POST } from './route'

const sqsEvent = (...bodies: string[]) =>
    new Request('http://localhost/api/jobs', {
        method: 'POST',
        body: JSON.stringify({ Records: bodies.map((body, i) => ({ messageId: `m${i}`, body })) }),
    })

const studyReviewMessage = (studyJobId: string) =>
    JSON.stringify({ job: 'study-review', payload: { studyJobId, round: 1 } })

const storedReport = async (studyJobId: string) => {
    const row = await db
        .selectFrom('studyReview')
        .select((eb) => eb.ref('report').$castTo<AnalysisReport | null>().as('report'))
        .where('studyJobId', '=', studyJobId)
        .executeTakeFirst()
    return row?.report ?? null
}

describe('POST /api/jobs', () => {
    beforeEach(() => {
        // An empty key sends the runner down its disabled-review path, which stores a report
        // without calling the model.
        vi.stubEnv('CLAUDE_API_KEY', '')
        vi.stubEnv('JOB_WORKER', 't')
    })

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('answers 404 and runs nothing outside the job worker', async () => {
        vi.stubEnv('JOB_WORKER', '')
        const { job } = await insertTestStudyJobData()

        const response = await POST(sqsEvent(studyReviewMessage(job.id)))

        expect(response.status).toBe(404)
        expect(await storedReport(job.id)).toBeNull()
    })

    it('runs the job named in the message', async () => {
        const { job } = await insertTestStudyJobData()

        const response = await POST(sqsEvent(studyReviewMessage(job.id)))

        expect(response.status).toBe(200)
        expect(await storedReport(job.id)).toMatchObject({ codeExplanation: 'Manual review required.' })
    })

    // The user gets Retry from the row long before SQS would redeliver, so neither an unreadable
    // message nor a failed job may come back an hour later.
    it('answers 200 for a message it cannot read or a job that fails, and runs the rest', async () => {
        const { job } = await insertTestStudyJobData()

        const response = await POST(
            sqsEvent(
                'not json',
                JSON.stringify({ job: 'no-such-job', payload: {} }),
                studyReviewMessage(randomUUID()),
                studyReviewMessage(job.id),
            ),
        )

        expect(response.status).toBe(200)
        expect(await storedReport(job.id)).toMatchObject({ codeExplanation: 'Manual review required.' })
    })
})
