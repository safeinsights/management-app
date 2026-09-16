import { db, describe, expect, insertTestStudyJobData, it } from '@/tests/unit.helpers'
import type { StudyJobStatus } from '@/database/types'
import { codeRoundForJob, isCurrentCodeRound } from './code-round'
import { codeSubmissionVersion } from './queries'

// Explicit timestamps in the past, so the seeded JOB-READY row (written at now()) never sorts
// between them and the no-submission boundary stays unambiguous.
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

const addStatus = (studyJobId: string, status: StudyJobStatus, createdAt: Date) =>
    db.insertInto('jobStatusChange').values({ studyJobId, status, createdAt }).execute()

describe('codeRoundForJob', () => {
    it('is round 1 for a first submission', async () => {
        const { study, job } = await insertTestStudyJobData({})
        await addStatus(job.id, 'CODE-SUBMITTED', minutesAgo(10))

        expect(await codeRoundForJob(job.id)).toBe(1)
        expect(await codeRoundForJob(job.id)).toBe(await codeSubmissionVersion(study.id))
    })

    // The distinction from codeSubmissionVersion: that version moves on at the reviewer's decision,
    // while the code on the job is still the round the reviewer was looking at.
    it('stays on the submitted round while a change request waits for the resubmit', async () => {
        const { study, job } = await insertTestStudyJobData({})
        await addStatus(job.id, 'CODE-SUBMITTED', minutesAgo(10))
        await addStatus(job.id, 'CODE-CHANGES-REQUESTED', minutesAgo(5))

        expect(await codeRoundForJob(job.id)).toBe(1)
        expect(await codeSubmissionVersion(study.id)).toBe(2)
    })

    it('advances to round 2 once the resubmit lands', async () => {
        const { study, job } = await insertTestStudyJobData({})
        await addStatus(job.id, 'CODE-SUBMITTED', minutesAgo(10))
        await addStatus(job.id, 'CODE-CHANGES-REQUESTED', minutesAgo(5))
        await addStatus(job.id, 'CODE-SUBMITTED', minutesAgo(1))

        expect(await codeRoundForJob(job.id)).toBe(2)
        expect(await codeRoundForJob(job.id)).toBe(await codeSubmissionVersion(study.id))
    })

    // Statuses written in one transaction share a createdAt (OTTER-552), so a change request can
    // tie with the resubmit it triggered. Comparing timestamps drops it and reads the job as a
    // round behind.
    it('counts a change request that ties with the resubmit on createdAt', async () => {
        const { study, job } = await insertTestStudyJobData({})
        const tied = minutesAgo(10)
        await addStatus(job.id, 'CODE-SUBMITTED', tied)
        await addStatus(job.id, 'CODE-CHANGES-REQUESTED', tied)
        await addStatus(job.id, 'CODE-SUBMITTED', tied)

        expect(await codeRoundForJob(job.id)).toBe(2)
        expect(await codeRoundForJob(job.id)).toBe(await codeSubmissionVersion(study.id))
    })

    // A results decision opens a fresh job; the round must not reset to 1 there (OTTER-556/558).
    it('keeps climbing across a results-decision job boundary', async () => {
        const { study, job: firstJob } = await insertTestStudyJobData({})
        await addStatus(firstJob.id, 'CODE-SUBMITTED', minutesAgo(30))
        await addStatus(firstJob.id, 'FILES-REJECTED', minutesAgo(20))

        const secondJob = await db
            .insertInto('studyJob')
            .values({ studyId: study.id })
            .returning('id')
            .executeTakeFirstOrThrow()
        await addStatus(secondJob.id, 'CODE-SUBMITTED', minutesAgo(10))

        expect(await codeRoundForJob(firstJob.id)).toBe(1)
        expect(await codeRoundForJob(secondJob.id)).toBe(2)
        expect(await codeRoundForJob(secondJob.id)).toBe(await codeSubmissionVersion(study.id))
    })

    it('falls back to the study-wide version for a job with no submission yet', async () => {
        const { study, job: firstJob } = await insertTestStudyJobData({})
        await addStatus(firstJob.id, 'CODE-SUBMITTED', minutesAgo(30))
        await addStatus(firstJob.id, 'FILES-APPROVED', minutesAgo(20))

        const openedJob = await db
            .insertInto('studyJob')
            .values({ studyId: study.id })
            .returning('id')
            .executeTakeFirstOrThrow()

        expect(await codeRoundForJob(openedJob.id)).toBe(2)
        expect(await codeRoundForJob(openedJob.id)).toBe(await codeSubmissionVersion(study.id))
    })
})

describe('isCurrentCodeRound', () => {
    it('tells a superseded round from the current one', async () => {
        const { job } = await insertTestStudyJobData({})
        await addStatus(job.id, 'CODE-SUBMITTED', minutesAgo(10))
        await addStatus(job.id, 'CODE-CHANGES-REQUESTED', minutesAgo(5))
        await addStatus(job.id, 'CODE-SUBMITTED', minutesAgo(1))

        expect(await isCurrentCodeRound(job.id, 1)).toBe(false)
        expect(await isCurrentCodeRound(job.id, 2)).toBe(true)
    })
})
