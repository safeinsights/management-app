import {
    db,
    describe,
    expect,
    insertTestJob,
    insertTestJobStatus,
    insertTestStudyJobData,
    it,
} from '@/tests/unit.helpers'
import { latestJobQuery } from './latest-job'

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

const latestJobId = async (studyId: string, options?: { submitted?: boolean }) => {
    const row = await latestJobQuery(db, studyId, options).select('studyJob.id').executeTakeFirstOrThrow()
    return row.id
}

// A closed first round plus the INITIATED job that opens round 2.
const givenClosedRoundAndOpenedJob = async () => {
    const { study, job: submittedJob } = await insertTestStudyJobData({ jobStatus: 'INITIATED' })
    await insertTestJobStatus(submittedJob.id, 'CODE-SUBMITTED', { at: minutesAgo(30) })
    await insertTestJobStatus(submittedJob.id, 'FILES-APPROVED', { at: minutesAgo(20) })
    const openedJob = await insertTestJob(study.id)
    return { study, submittedJob, openedJob }
}

describe('latestJobQuery', () => {
    it('selects the job that opened the next round', async () => {
        const { study, openedJob } = await givenClosedRoundAndOpenedJob()

        expect(await latestJobId(study.id)).toBe(openedJob.id)
    })

    it('skips a job that is still INITIATED when submitted is set', async () => {
        const { study, submittedJob } = await givenClosedRoundAndOpenedJob()

        expect(await latestJobId(study.id, { submitted: true })).toBe(submittedJob.id)
    })

    it('selects the higher round before the newer id', async () => {
        const { study, submittedJob, openedJob } = await givenClosedRoundAndOpenedJob()
        // eslint-disable-next-line custom/noJobStatusWrites -- no real history puts a higher round on an older job
        await db.updateTable('studyJob').set({ round: 3 }).where('id', '=', submittedJob.id).execute()

        expect(openedJob.id > submittedJob.id).toBe(true)
        expect(await latestJobId(study.id)).toBe(submittedJob.id)
    })
})
