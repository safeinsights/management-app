import dayjs from 'dayjs'
import {
    db,
    describe,
    expect,
    insertTestBaselineJob,
    insertTestJob,
    insertTestJobStatus,
    insertTestJobStatuses,
    insertTestLaterJob,
    insertTestStudyJobData,
    it,
    mockSessionWithTestData,
    type PriorCodeRunOptions,
} from '@/tests/unit.helpers'
import { seedJobFileRow } from '@/tests/artifact.helpers'
import type { StudyJobStatus } from '@/database/types'
import { jobRound, latestSubmittedJobForStudy, priorCodeRunsForStudy } from './study-job'

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

const daysAgo = (days: number) => dayjs().subtract(days, 'day').toDate()

const setupStudy = async (priorRuns: PriorCodeRunOptions[] = []) => {
    const { org } = await mockSessionWithTestData({ orgType: 'enclave' })
    const {
        study,
        job: latestJob,
        priorJobs,
    } = await insertTestStudyJobData({
        org,
        jobStatus: 'RUN-COMPLETE',
        priorRuns,
    })
    return { study, latestJob, priorJobs }
}

describe('priorCodeRunsForStudy', () => {
    it('returns nothing when the latest run is the only one', async () => {
        const { study, latestJob } = await setupStudy()

        expect(await priorCodeRunsForStudy(study.id, latestJob.id)).toEqual([])
    })

    it('returns every earlier run except the latest, newest run first', async () => {
        // Inserted out of date order, so the result order has to come from the run dates.
        const {
            study,
            latestJob,
            priorJobs: [middle, oldest, newest],
        } = await setupStudy([
            { ranAt: daysAgo(5), outcome: 'JOB-ERRORED' },
            { ranAt: daysAgo(9), decision: 'FILES-REJECTED' },
            { ranAt: daysAgo(2) },
        ])

        const runs = await priorCodeRunsForStudy(study.id, latestJob.id)

        expect(runs.map((run) => run.id)).toEqual([newest.id, middle.id, oldest.id])
    })

    it('dates a run by when it ended, not by its later outputs decision', async () => {
        const ranAt = daysAgo(3)
        const { study, latestJob } = await setupStudy([{ ranAt }])

        const [run] = await priorCodeRunsForStudy(study.id, latestJob.id)

        expect(run.ranAt).toEqual(ranAt)
    })

    it("returns each run's statuses, for its outcome and decision labels", async () => {
        const { study, latestJob } = await setupStudy([
            { ranAt: daysAgo(3), outcome: 'JOB-ERRORED', decision: 'FILES-REJECTED' },
        ])

        const [run] = await priorCodeRunsForStudy(study.id, latestJob.id)

        expect(run.statusChanges.map((change) => change.status).sort()).toEqual([
            'CODE-SUBMITTED',
            'FILES-REJECTED',
            'INITIATED',
            'JOB-ERRORED',
        ])
    })

    it("returns only each run's own outputs decision feedback", async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const {
            study,
            job: latestJob,
            priorJobs: [older, newer],
        } = await insertTestStudyJobData({
            org,
            jobStatus: 'RUN-COMPLETE',
            priorRuns: [
                { ranAt: daysAgo(6), feedback: { authorId: user.id, text: 'older run feedback' } },
                { ranAt: daysAgo(3), feedback: { authorId: user.id, text: 'newer run feedback' } },
            ],
        })

        const runs = await priorCodeRunsForStudy(study.id, latestJob.id)
        const feedbackText = (id: string) =>
            JSON.stringify(runs.find((run) => run.id === id)?.feedback.map((entry) => entry.body))

        expect(feedbackText(newer.id)).toContain('newer run feedback')
        expect(feedbackText(newer.id)).not.toContain('older run feedback')
        expect(feedbackText(older.id)).toContain('older run feedback')
        expect(runs[0].feedback[0].authorName).toBeTruthy()
    })

    it('leaves out jobs that never ran', async () => {
        const {
            study,
            latestJob,
            priorJobs: [ran],
        } = await setupStudy([{ ranAt: daysAgo(4) }])
        const rejected = await insertTestBaselineJob(study.id)
        await insertTestJobStatuses(rejected.id, ['CODE-SUBMITTED', 'CODE-REJECTED'])
        await insertTestBaselineJob(study.id)

        const runs = await priorCodeRunsForStudy(study.id, latestJob.id)

        expect(runs.map((run) => run.id)).toEqual([ran.id])
    })

    it('leaves out runs from other studies', async () => {
        const { study, latestJob } = await setupStudy()
        await setupStudy([{ ranAt: daysAgo(1) }])

        expect(await priorCodeRunsForStudy(study.id, latestJob.id)).toEqual([])
    })
})
