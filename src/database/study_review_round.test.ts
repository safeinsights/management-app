import { db, describe, expect, insertTestStudyJobData, it } from '@/tests/unit.helpers'
import type { StudyJobStatus } from '@/database/types'
import type { Kysely } from 'kysely'
import { backfillStudyReviewRound } from './migrations/1786900000000_study_review_round'

const REPORT = { codeExplanation: 'Aggregates scores by school.' }

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

const addStatus = (studyJobId: string, status: StudyJobStatus, createdAt: Date) =>
    db.insertInto('jobStatusChange').values({ studyJobId, status, createdAt }).execute()

const insertReview = (studyJobId: string, createdAt: Date) =>
    db
        .insertInto('studyReview')
        .values({ studyJobId, report: JSON.stringify(REPORT), round: 1, createdAt })
        .returning('id')
        .executeTakeFirstOrThrow()

const roundOf = async ({ id }: { id: string }) => {
    const row = await db.selectFrom('studyReview').select('round').where('id', '=', id).executeTakeFirstOrThrow()
    return row.round
}

// A resubmitted job: submitted, changes requested, submitted again.
const insertResubmittedJob = async () => {
    const { study, job } = await insertTestStudyJobData({})
    await addStatus(job.id, 'CODE-SUBMITTED', minutesAgo(30))
    await addStatus(job.id, 'CODE-CHANGES-REQUESTED', minutesAgo(20))
    await addStatus(job.id, 'CODE-SUBMITTED', minutesAgo(10))
    return { study, job }
}

describe('study_review_round migration', () => {
    it('numbers a summary written after the resubmit as the second round', async () => {
        const { study, job } = await insertResubmittedJob()
        const review = await insertReview(job.id, minutesAgo(5))

        await backfillStudyReviewRound(db as unknown as Kysely<unknown>, study.id)

        expect(await roundOf(review)).toBe(2)
    })

    // Today's rows are almost all of this shape, and the column's default already describes them.
    it('leaves a summary written before the change request on the first round', async () => {
        const { study, job } = await insertResubmittedJob()
        const review = await insertReview(job.id, minutesAgo(25))

        await backfillStudyReviewRound(db as unknown as Kysely<unknown>, study.id)

        expect(await roundOf(review)).toBe(1)
    })

    it('counts the rounds of its own study only', async () => {
        const { study, job } = await insertTestStudyJobData({})
        await addStatus(job.id, 'CODE-SUBMITTED', minutesAgo(30))
        const review = await insertReview(job.id, minutesAgo(5))

        const { job: otherJob } = await insertTestStudyJobData({})
        await addStatus(otherJob.id, 'CODE-CHANGES-REQUESTED', minutesAgo(20))

        await backfillStudyReviewRound(db as unknown as Kysely<unknown>, study.id)

        expect(await roundOf(review)).toBe(1)
    })
})
