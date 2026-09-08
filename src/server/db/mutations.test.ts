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
        expect(job.hasSubmission).toBe(false)
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
        expect(result.hasSubmission).toBe(true)
        expect(await jobsForStudy(study.id)).toHaveLength(1)
    })

    it('reuses the job after CODE-CHANGES-REQUESTED (revise in place, no new round)', async () => {
        const org = await insertTestOrg()
        const { study, job } = await insertTestStudyJobData({
            org,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await addFile(job.id)
        await addStatus(job.id, 'CODE-CHANGES-REQUESTED')

        const result = await getOrCreateCurrentRoundJob(db, study.id)

        expect(result.created).toBe(false)
        expect(result.id).toBe(job.id)
        expect(await jobsForStudy(study.id)).toHaveLength(1)
    })

    it('reuses the job after JOB-ERRORED (awaiting files review, no new round)', async () => {
        const org = await insertTestOrg()
        const { study, job } = await insertTestStudyJobData({
            org,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await addFile(job.id)
        await addStatus(job.id, 'CODE-APPROVED')
        await addStatus(job.id, 'JOB-ERRORED')

        const result = await getOrCreateCurrentRoundJob(db, study.id)

        expect(result.created).toBe(false)
        expect(result.id).toBe(job.id)
        expect(await jobsForStudy(study.id)).toHaveLength(1)
    })

    it('opens a new round after FILES-REJECTED', async () => {
        const org = await insertTestOrg()
        const { study, job } = await insertTestStudyJobData({
            org,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await addFile(job.id)
        await addStatus(job.id, 'CODE-APPROVED')
        await addStatus(job.id, 'RUN-COMPLETE')
        await addStatus(job.id, 'FILES-REJECTED')

        const result = await getOrCreateCurrentRoundJob(db, study.id)

        expect(result.created).toBe(true)
        expect(result.id).not.toBe(job.id)
        expect(await jobsForStudy(study.id)).toHaveLength(2)
    })

    it('opens a new round after FILES-APPROVED', async () => {
        const org = await insertTestOrg()
        const { study, job } = await insertTestStudyJobData({
            org,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await addFile(job.id)
        await addStatus(job.id, 'CODE-APPROVED')
        await addStatus(job.id, 'RUN-COMPLETE')
        await addStatus(job.id, 'FILES-APPROVED')

        const result = await getOrCreateCurrentRoundJob(db, study.id)

        expect(result.created).toBe(true)
        expect(result.id).not.toBe(job.id)
        expect(await jobsForStudy(study.id)).toHaveLength(2)
    })

    // createdAt is constant within a transaction and v7 ids are not monotonic inside a millisecond,
    // so a "latest status" lookup over tied rows is non-deterministic.
    it('deterministically opens a new round when round-closing and non-round-closing statuses share a createdAt', async () => {
        const org = await insertTestOrg()

        // Fresh study per iteration: an order-dependent implementation would flip the verdict.
        for (let i = 0; i < 8; i++) {
            const { study, job } = await insertTestStudyJobData({
                org,
                studyStatus: 'APPROVED',
                jobStatus: 'CODE-SUBMITTED',
            })
            await addFile(job.id)
            // Forces the createdAt tie the bug depended on.
            const tied = new Date()
            await db
                .insertInto('jobStatusChange')
                .values([
                    { studyJobId: job.id, status: 'RUN-COMPLETE', createdAt: tied },
                    { studyJobId: job.id, status: 'FILES-REJECTED', createdAt: tied },
                ])
                .execute()

            const result = await getOrCreateCurrentRoundJob(db, study.id)
            expect(result.created).toBe(true)
            expect(result.id).not.toBe(job.id)
            expect(await jobsForStudy(study.id)).toHaveLength(2)
        }
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

    it('opens a new round when the latest job has a round-closing status', async () => {
        const org = await insertTestOrg()
        const { study, job } = await insertTestStudyJobData({
            org,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })
        await addFile(job.id)
        await addStatus(job.id, 'CODE-APPROVED')
        await addStatus(job.id, 'RUN-COMPLETE')
        await addStatus(job.id, 'FILES-APPROVED')

        await ensureRoundJobForLaunch(db, study.id)

        expect(await jobsForStudy(study.id)).toHaveLength(2)
    })

    it('does NOT refresh createdAt when the round already has files (OTTER-602)', async () => {
        const org = await insertTestOrg()
        const { study, job } = await insertTestStudyJobData({ org, studyStatus: 'APPROVED', jobStatus: 'INITIATED' })
        const backdated = new Date(Date.now() - 60_000)
        await db.updateTable('studyJob').set({ createdAt: backdated }).where('id', '=', job.id).execute()

        const result = await ensureRoundJobForLaunch(db, study.id, { hasWorkspaceFiles: true })

        const after = await jobsForStudy(study.id)
        expect(after).toHaveLength(1)
        expect(after[0].id).toBe(job.id)
        expect(after[0].createdAt.getTime()).toBe(backdated.getTime())
        expect(result.createdAt.getTime()).toBe(backdated.getTime())
    })

    it('still refreshes createdAt when the round has no files yet', async () => {
        const org = await insertTestOrg()
        const { study, job } = await insertTestStudyJobData({ org, studyStatus: 'APPROVED', jobStatus: 'INITIATED' })
        const backdated = new Date(Date.now() - 60_000)
        await db.updateTable('studyJob').set({ createdAt: backdated }).where('id', '=', job.id).execute()

        await ensureRoundJobForLaunch(db, study.id, { hasWorkspaceFiles: false })

        const after = await jobsForStudy(study.id)
        expect(after).toHaveLength(1)
        expect(after[0].id).toBe(job.id)
        expect(after[0].createdAt.getTime()).toBeGreaterThan(backdated.getTime())
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
