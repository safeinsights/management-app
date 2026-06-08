import { describe, expect, it } from 'vitest'
import { db } from '@/database'
import { insertTestOrg, insertTestStudyJobData, insertTestStudyOnly } from '@/tests/unit.helpers'
import type { StudyJobStatus } from '@/database/types'
import { ensureRoundJobForLaunch, ensureRoundJobForUpload, getOrCreateCurrentRoundJob } from './mutations'

const jobsForStudy = (studyId: string) =>
    db.selectFrom('studyJob').select(['id', 'createdAt']).where('studyId', '=', studyId).orderBy('createdAt').execute()

const addStatus = (studyJobId: string, status: StudyJobStatus) =>
    db.insertInto('jobStatusChange').values({ studyJobId, status }).execute()

const addFile = (studyJobId: string) =>
    db
        .insertInto('studyJobFile')
        .values({ studyJobId, name: 'main.r', path: `path/${studyJobId}/main.r`, fileType: 'MAIN-CODE' })
        .execute()

describe('getOrCreateCurrentRoundJob (OTTER-601)', () => {
    it('creates the first round job when the study has none', async () => {
        const org = await insertTestOrg()
        const { study } = await insertTestStudyOnly({ org })

        const job = await getOrCreateCurrentRoundJob(db, study.id)

        expect(job.created).toBe(true)
        expect(job.latestStatus).toBe('INITIATED')
        expect(await jobsForStudy(study.id)).toHaveLength(1)
    })

    it('reuses the open round job rather than creating a second one', async () => {
        const org = await insertTestOrg()
        const { study, job } = await insertTestStudyJobData({ org, studyStatus: 'APPROVED', jobStatus: 'INITIATED' })

        const result = await getOrCreateCurrentRoundJob(db, study.id)

        expect(result.created).toBe(false)
        expect(result.id).toBe(job.id)
        expect(await jobsForStudy(study.id)).toHaveLength(1)
    })

    it('reuses a submitted-but-undecided job (does not mask code under review)', async () => {
        const org = await insertTestOrg()
        const { study, job } = await insertTestStudyJobData({
            org,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })

        const result = await getOrCreateCurrentRoundJob(db, study.id)

        expect(result.created).toBe(false)
        expect(result.id).toBe(job.id)
        expect(result.latestStatus).toBe('CODE-SUBMITTED')
        expect(await jobsForStudy(study.id)).toHaveLength(1)
    })

    it('opens a new round once the latest job is resubmittable (CODE-CHANGES-REQUESTED)', async () => {
        const org = await insertTestOrg()
        const { study, job } = await insertTestStudyJobData({
            org,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await addFile(job.id)
        await addStatus(job.id, 'CODE-CHANGES-REQUESTED')

        const result = await getOrCreateCurrentRoundJob(db, study.id)

        expect(result.created).toBe(true)
        expect(result.id).not.toBe(job.id)
        expect(await jobsForStudy(study.id)).toHaveLength(2)
    })

    it('does NOT open a new round after a terminal CODE-REJECTED (not resubmittable)', async () => {
        const org = await insertTestOrg()
        const { study, job } = await insertTestStudyJobData({
            org,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await addFile(job.id)
        await addStatus(job.id, 'CODE-REJECTED')

        const result = await getOrCreateCurrentRoundJob(db, study.id)

        expect(result.created).toBe(false)
        expect(result.id).toBe(job.id)
        expect(await jobsForStudy(study.id)).toHaveLength(1)
    })
})

describe('ensureRoundJobForLaunch (OTTER-601)', () => {
    it('creates the first job and re-anchors createdAt on a fresh open round', async () => {
        const org = await insertTestOrg()
        const { study } = await insertTestStudyOnly({ org })

        await ensureRoundJobForLaunch(db, study.id)

        expect(await jobsForStudy(study.id)).toHaveLength(1)
    })

    it('reuses the open round job and refreshes its createdAt (no stacking)', async () => {
        const org = await insertTestOrg()
        const { study, job } = await insertTestStudyJobData({ org, studyStatus: 'APPROVED', jobStatus: 'INITIATED' })
        const [before] = await jobsForStudy(study.id)

        const result = await ensureRoundJobForLaunch(db, study.id)

        const after = await jobsForStudy(study.id)
        expect(after).toHaveLength(1)
        expect(after[0].id).toBe(job.id)
        expect(result.id).toBe(job.id)
        expect(after[0].createdAt.getTime()).toBeGreaterThanOrEqual(before.createdAt.getTime())
    })

    it('does NOT refresh createdAt of a submitted job under review', async () => {
        const org = await insertTestOrg()
        const { study, job } = await insertTestStudyJobData({
            org,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })
        const [before] = await jobsForStudy(study.id)

        await ensureRoundJobForLaunch(db, study.id)

        const after = await jobsForStudy(study.id)
        expect(after).toHaveLength(1)
        expect(after[0].id).toBe(job.id)
        expect(after[0].createdAt.getTime()).toBe(before.createdAt.getTime())
    })

    it('opens a new round when the latest job is resubmittable', async () => {
        const org = await insertTestOrg()
        const { study, job } = await insertTestStudyJobData({
            org,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await addFile(job.id)
        await addStatus(job.id, 'RUN-COMPLETE')

        await ensureRoundJobForLaunch(db, study.id)

        expect(await jobsForStudy(study.id)).toHaveLength(2)
    })
})

describe('ensureRoundJobForUpload (OTTER-601)', () => {
    it('creates a job when none exists', async () => {
        const org = await insertTestOrg()
        const { study } = await insertTestStudyOnly({ org })

        await ensureRoundJobForUpload(db, study.id)

        expect(await jobsForStudy(study.id)).toHaveLength(1)
    })

    it('reuses the open round job rather than stacking another', async () => {
        const org = await insertTestOrg()
        const { study, job } = await insertTestStudyJobData({ org, studyStatus: 'APPROVED', jobStatus: 'INITIATED' })

        await ensureRoundJobForUpload(db, study.id)

        const after = await jobsForStudy(study.id)
        expect(after).toHaveLength(1)
        expect(after[0].id).toBe(job.id)
    })

    it('does not mask a submitted job under review', async () => {
        const org = await insertTestOrg()
        const { study, job } = await insertTestStudyJobData({
            org,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'CODE-SUBMITTED',
        })

        await ensureRoundJobForUpload(db, study.id)

        const after = await jobsForStudy(study.id)
        expect(after).toHaveLength(1)
        expect(after[0].id).toBe(job.id)
    })
})
