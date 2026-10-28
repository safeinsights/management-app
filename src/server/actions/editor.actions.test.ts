import {
    actionResult,
    describe,
    expect,
    insertTestJobStatuses,
    insertTestOrg,
    insertTestStudyJobData,
    insertTestUser,
    it,
    mockSessionWithTestData,
} from '@/tests/unit.helpers'
import { getStudyStatusAction } from './editor.actions'

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
        await insertTestJobStatuses(job.id, ['CODE-APPROVED', 'RUN-COMPLETE', 'FILES-APPROVED', 'CODE-SCANNED'])

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
