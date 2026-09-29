import {
    actionResult,
    db,
    describe,
    expect,
    insertTestOrg,
    insertTestStudyJobData,
    insertTestUser,
    it,
    mockSessionWithTestData,
} from '@/tests/unit.helpers'
import type { StudyJobStatus } from '@/database/types'
import { getStudyStatusAction } from './editor.actions'

// Explicit timestamps: rows written in one tick tie on createdAt, and v7 ids are not monotonic
// inside a millisecond, so the order under test would otherwise be luck.
const insertStatuses = async (studyJobId: string, statuses: StudyJobStatus[]) => {
    const base = Date.now()
    for (const [index, status] of statuses.entries()) {
        await db
            .insertInto('jobStatusChange')
            .values({ studyJobId, status, createdAt: new Date(base + (index + 1) * 1000) })
            .execute()
    }
}

describe('getStudyStatusAction', () => {
    // OTTER-726: the outputs review backstop has to see the files decision even when the scanner
    // appends CODE-SCANNED afterwards, which is the ordering QA recorded.
    it('lists every status of the named job, so a late scan row cannot hide the files decision', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await insertStatuses(job.id, ['CODE-APPROVED', 'RUN-COMPLETE', 'FILES-APPROVED', 'CODE-SCANNED'])

        const result = actionResult(await getStudyStatusAction({ studyId: study.id, studyJobId: job.id }))

        expect(result.latestJobStatus).toBe('CODE-SCANNED')
        expect(result.jobStatuses).toEqual([
            'CODE-SUBMITTED',
            'CODE-APPROVED',
            'RUN-COMPLETE',
            'FILES-APPROVED',
            'CODE-SCANNED',
        ])
    })

    it('returns no job statuses when no job is named', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        const result = actionResult(await getStudyStatusAction({ studyId: study.id }))

        expect(result.jobStatuses).toEqual([])
    })

    it('returns no job statuses for a job that belongs to another study', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        const otherOrg = await insertTestOrg({ slug: 'otter-726-other', type: 'enclave' })
        const { user: otherResearcher } = await insertTestUser({ org: otherOrg })
        const { job: foreignJob } = await insertTestStudyJobData({
            org: otherOrg,
            researcherId: otherResearcher.id,
            jobStatus: 'FILES-APPROVED',
        })

        const result = actionResult(await getStudyStatusAction({ studyId: study.id, studyJobId: foreignJob.id }))

        expect(result.jobStatuses).toEqual([])
    })
})
