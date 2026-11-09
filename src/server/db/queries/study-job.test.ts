import {
    db,
    describe,
    expect,
    insertTestJob,
    insertTestJobStatus,
    insertTestLaterJob,
    insertTestStudyJobData,
    it,
    mockSessionWithTestData,
} from '@/tests/unit.helpers'
import { seedJobFileRow } from '@/tests/artifact.helpers'
import type { StudyJobStatus } from '@/database/types'
import { jobRound, latestSubmittedJobForStudy } from './study-job'

// Explicit timestamps, so the order of the rows under test is never left to the clock.
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

const addStatus = (studyJobId: string, status: StudyJobStatus, createdAt: Date) =>
    insertTestJobStatus(studyJobId, status, { at: createdAt })

describe('the stored job round', () => {
    it('is round 1 for a first submission', async () => {
        const { job } = await insertTestStudyJobData({ jobStatus: 'INITIATED' })
        await addStatus(job.id, 'CODE-SUBMITTED', minutesAgo(10))

        expect(await jobRound(job.id, db)).toBe(1)
    })

    it('stays on the submitted round while a change request waits for the resubmit', async () => {
        const { job } = await insertTestStudyJobData({ jobStatus: 'INITIATED' })
        await addStatus(job.id, 'CODE-SUBMITTED', minutesAgo(10))
        await addStatus(job.id, 'CODE-CHANGES-REQUESTED', minutesAgo(5))

        expect(await jobRound(job.id, db)).toBe(1)
    })

    it('advances to round 2 once the resubmit lands', async () => {
        const { job } = await insertTestStudyJobData({ jobStatus: 'INITIATED' })
        await addStatus(job.id, 'CODE-SUBMITTED', minutesAgo(10))
        await addStatus(job.id, 'CODE-CHANGES-REQUESTED', minutesAgo(5))
        await addStatus(job.id, 'CODE-SUBMITTED', minutesAgo(1))

        expect(await jobRound(job.id, db)).toBe(2)
    })

    // createdAt defaults to now(), which is fixed for a whole transaction, so a change request ties
    // exactly with the resubmit it triggered whenever one transaction writes both. Comparing
    // timestamps drops it and reads the job as a round behind.
    it('counts a change request that ties with the resubmit on createdAt', async () => {
        const { job } = await insertTestStudyJobData({ jobStatus: 'INITIATED' })
        const tied = minutesAgo(10)
        await addStatus(job.id, 'CODE-SUBMITTED', tied)
        await addStatus(job.id, 'CODE-CHANGES-REQUESTED', tied)
        await addStatus(job.id, 'CODE-SUBMITTED', tied)

        expect(await jobRound(job.id, db)).toBe(2)
    })

    // A results decision opens a fresh job; the round must not reset to 1 there (OTTER-556/558).
    it('keeps climbing across a results-decision job boundary', async () => {
        const { study, job: firstJob } = await insertTestStudyJobData({ jobStatus: 'INITIATED' })
        await addStatus(firstJob.id, 'CODE-SUBMITTED', minutesAgo(30))
        await addStatus(firstJob.id, 'FILES-REJECTED', minutesAgo(20))

        const secondJob = await insertTestJob(study.id)
        await addStatus(secondJob.id, 'CODE-SUBMITTED', minutesAgo(10))

        expect(await jobRound(firstJob.id, db)).toBe(1)
        expect(await jobRound(secondJob.id, db)).toBe(2)
    })

    // The mirror of the boundary above: a decision on a job opened later belongs to a later round,
    // and counting it would raise this job's round after the fact, putting the rows stored against
    // it out of reach of every reader.
    it('is not raised by a decision on a job opened after it', async () => {
        const { study, job: firstJob } = await insertTestStudyJobData({ jobStatus: 'INITIATED' })
        await addStatus(firstJob.id, 'CODE-SUBMITTED', minutesAgo(40))
        await addStatus(firstJob.id, 'CODE-CHANGES-REQUESTED', minutesAgo(35))
        await addStatus(firstJob.id, 'CODE-SUBMITTED', minutesAgo(30))
        await addStatus(firstJob.id, 'FILES-APPROVED', minutesAgo(25))

        const secondJob = await insertTestJob(study.id)
        await addStatus(secondJob.id, 'CODE-SUBMITTED', minutesAgo(20))
        await addStatus(secondJob.id, 'CODE-CHANGES-REQUESTED', minutesAgo(10))

        expect(await jobRound(firstJob.id, db)).toBe(2)
        expect(await jobRound(secondJob.id, db)).toBe(3)
    })

    it('opens a job with no submission yet on the next round', async () => {
        const { study, job: firstJob } = await insertTestStudyJobData({ jobStatus: 'INITIATED' })
        await addStatus(firstJob.id, 'CODE-SUBMITTED', minutesAgo(30))
        await addStatus(firstJob.id, 'FILES-APPROVED', minutesAgo(20))

        const openedJob = await insertTestJob(study.id)

        expect(await jobRound(openedJob.id, db)).toBe(2)
    })
})

// OTTER-882: the reviewer's code run card reads this job, so an earlier run's files must never ride along.
describe('latestSubmittedJobForStudy', () => {
    it('returns the latest run with only its own files', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study, job: earlierJob } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        await seedJobFileRow(earlierJob.id, 'ENCRYPTED-RESULT', 'encrypted-results.zip')
        const latestJob = await insertTestLaterJob(study.id, ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE'])
        const latestFile = await seedJobFileRow(latestJob.id, 'ENCRYPTED-RESULT', 'encrypted-results.zip')

        const job = await latestSubmittedJobForStudy(study.id)

        expect(job?.id).toBe(latestJob.id)
        expect(job?.files.map((file) => file.id)).toEqual([latestFile.id])
    })
})
