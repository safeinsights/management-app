import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import {
    insertTestBaselineJob,
    insertTestJobStatuses,
    insertTestPriorCodeRun,
    insertTestStudyJobData,
    mockSessionWithTestData,
} from '@/tests/unit.helpers'
import { priorCodeRunsForStudy } from './study-job'

const daysAgo = (days: number) => dayjs().subtract(days, 'day').toDate()

const setupStudy = async () => {
    const { org } = await mockSessionWithTestData({ orgType: 'enclave' })
    const { study, job: latestJob } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
    return { study, latestJob }
}

describe('priorCodeRunsForStudy', () => {
    it('returns nothing when the latest run is the only one', async () => {
        const { study, latestJob } = await setupStudy()

        expect(await priorCodeRunsForStudy(study.id, latestJob.id)).toEqual([])
    })

    it('returns every earlier run except the latest, newest run first', async () => {
        const { study, latestJob } = await setupStudy()
        // Inserted out of date order, so the result order has to come from the run dates.
        const middle = await insertTestPriorCodeRun(study.id, { ranAt: daysAgo(5), outcome: 'JOB-ERRORED' })
        const oldest = await insertTestPriorCodeRun(study.id, { ranAt: daysAgo(9), decision: 'FILES-REJECTED' })
        const newest = await insertTestPriorCodeRun(study.id, { ranAt: daysAgo(2) })

        const runs = await priorCodeRunsForStudy(study.id, latestJob.id)

        expect(runs.map((run) => run.id)).toEqual([newest.id, middle.id, oldest.id])
    })

    it('dates a run by when it ended, not by its later outputs decision', async () => {
        const { study, latestJob } = await setupStudy()
        const ranAt = daysAgo(3)
        await insertTestPriorCodeRun(study.id, { ranAt })

        const [run] = await priorCodeRunsForStudy(study.id, latestJob.id)

        expect(run.ranAt).toEqual(ranAt)
    })

    it("returns each run's statuses, for its outcome and decision labels", async () => {
        const { study, latestJob } = await setupStudy()
        await insertTestPriorCodeRun(study.id, {
            ranAt: daysAgo(3),
            outcome: 'JOB-ERRORED',
            decision: 'FILES-REJECTED',
        })

        const [run] = await priorCodeRunsForStudy(study.id, latestJob.id)

        expect(run.statusChanges.map((change) => change.status).sort()).toEqual([
            'CODE-SUBMITTED',
            'FILES-REJECTED',
            'JOB-ERRORED',
        ])
    })

    it("returns only each run's own outputs decision feedback", async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study, job: latestJob } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        const older = await insertTestPriorCodeRun(study.id, {
            ranAt: daysAgo(6),
            feedback: { authorId: user.id, text: 'older run feedback' },
        })
        const newer = await insertTestPriorCodeRun(study.id, {
            ranAt: daysAgo(3),
            feedback: { authorId: user.id, text: 'newer run feedback' },
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
        const { study, latestJob } = await setupStudy()
        const ran = await insertTestPriorCodeRun(study.id, { ranAt: daysAgo(4) })
        const rejected = await insertTestBaselineJob(study.id)
        await insertTestJobStatuses(rejected.id, ['CODE-SUBMITTED', 'CODE-REJECTED'])
        await insertTestBaselineJob(study.id)

        const runs = await priorCodeRunsForStudy(study.id, latestJob.id)

        expect(runs.map((run) => run.id)).toEqual([ran.id])
    })

    it('leaves out runs from other studies', async () => {
        const { study, latestJob } = await setupStudy()
        const { study: otherStudy } = await setupStudy()
        await insertTestPriorCodeRun(otherStudy.id, { ranAt: daysAgo(1) })

        expect(await priorCodeRunsForStudy(study.id, latestJob.id)).toEqual([])
    })
})
