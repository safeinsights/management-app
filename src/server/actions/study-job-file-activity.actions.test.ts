import { describe, expect, test } from 'vitest'
import {
    actionResult,
    db,
    faker,
    insertTestBaselineJob,
    insertTestOrg,
    insertTestStudyJobData,
    insertTestStudyOnly,
    insertTestUser,
    mockClerkSession,
    mockSessionWithTestData,
} from '@/tests/unit.helpers'
import { fetchJobFileActivityAction, recordJobFileActivityAction } from './study-job-file-activity.actions'

const insertArchive = async (jobId: string, name = 'encrypted-logs.zip') =>
    await db
        .insertInto('studyJobFile')
        .values({ studyJobId: jobId, name, path: `results/${name}`, fileType: 'ENCRYPTED-CODE-RUN-LOG' })
        .returning('id')
        .executeTakeFirstOrThrow()

const setup = async () => {
    const session = await mockSessionWithTestData({ orgType: 'enclave' })
    const { job } = await insertTestStudyJobData({ org: session.org, jobStatus: 'JOB-ERRORED' })
    const archive = await insertArchive(job.id)
    return { ...session, job, archive, orgSlug: session.org.slug }
}

type SideUser = Awaited<ReturnType<typeof insertTestUser>>['user']

const actAs = (user: SideUser, org: { id: string; slug: string; type: 'enclave' | 'lab' }) =>
    mockClerkSession({
        userId: user.id,
        clerkUserId: user.clerkId,
        email: user.email ?? undefined,
        orgSlug: org.slug,
        orgId: org.id,
        orgType: org.type,
    })

// A study whose two sides are DIFFERENT orgs, with one member on each: the shape the bug needs.
const setupTwoSided = async () => {
    const enclave = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
    const lab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
    const { user: reviewer } = await insertTestUser({ org: enclave })
    const { user: researcher } = await insertTestUser({ org: lab })
    const { study } = await insertTestStudyOnly({ org: enclave, submittedByOrg: lab, researcherId: researcher.id })
    const job = await insertTestBaselineJob(study.id)
    const archive = await insertArchive(job.id)
    return { enclave, lab, reviewer, researcher, job, archive }
}

const viewRunLog = async (jobId: string, orgSlug: string, studyJobFileId: string) =>
    actionResult(
        await recordJobFileActivityAction({
            jobId,
            orgSlug,
            files: [{ studyJobFileId, filePath: 'run.log' }],
            action: 'VIEWED',
        }),
    )

describe('recordJobFileActivityAction', () => {
    test('records a view against one inner file', async () => {
        const { job, archive, user, org, orgSlug } = await setup()

        await viewRunLog(job.id, orgSlug, archive.id)

        const rows = await db
            .selectFrom('studyJobFileActivity')
            .selectAll('studyJobFileActivity')
            .where('studyJobFileId', '=', archive.id)
            .execute()
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ action: 'VIEWED', filePath: 'run.log', userId: user.id, orgId: org.id })
    })

    test('records one row per file for a bulk download', async () => {
        const { job, archive, orgSlug } = await setup()

        actionResult(
            await recordJobFileActivityAction({
                jobId: job.id,
                orgSlug,
                files: [
                    { studyJobFileId: archive.id, filePath: 'run.log' },
                    { studyJobFileId: archive.id, filePath: 'results.csv' },
                ],
                action: 'DOWNLOADED',
            }),
        )

        const rows = await db
            .selectFrom('studyJobFileActivity')
            .selectAll('studyJobFileActivity')
            .where('studyJobFileId', '=', archive.id)
            .execute()
        expect(rows).toHaveLength(2)
        expect(rows.map((r) => r.filePath).sort()).toEqual(['results.csv', 'run.log'])
        expect(rows.every((r) => r.action === 'DOWNLOADED')).toBe(true)
    })

    test('ignores archives that belong to a different job', async () => {
        const { job, org, orgSlug } = await setup()
        const { job: otherJob } = await insertTestStudyJobData({ org, jobStatus: 'JOB-ERRORED' })
        const foreignArchive = await insertArchive(otherJob.id, 'other.zip')

        await viewRunLog(job.id, orgSlug, foreignArchive.id)

        const rows = await db
            .selectFrom('studyJobFileActivity')
            .selectAll('studyJobFileActivity')
            .where('studyJobFileId', '=', foreignArchive.id)
            .execute()
        expect(rows).toHaveLength(0)
    })

    test('permission denied for an unrelated org', async () => {
        const { job, archive, orgSlug } = await setup()
        await mockSessionWithTestData({ orgSlug: 'unrelated-org', orgType: 'lab' })

        const result = await recordJobFileActivityAction({
            jobId: job.id,
            orgSlug,
            files: [{ studyJobFileId: archive.id, filePath: 'run.log' }],
            action: 'VIEWED',
        })

        expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
    })

    // OTTER-783: the slug is client-supplied, so a lab member could otherwise name the Data
    // Partner and write (or read) as that side.
    test('permission denied when the org is not one the caller belongs to', async () => {
        const { enclave, lab, researcher, job, archive } = await setupTwoSided()
        actAs(researcher, lab)

        const result = await recordJobFileActivityAction({
            jobId: job.id,
            orgSlug: enclave.slug,
            files: [{ studyJobFileId: archive.id, filePath: 'run.log' }],
            action: 'VIEWED',
        })

        expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
    })

    test('permission denied when the org is not a party to the study', async () => {
        const { lab, researcher, job, archive } = await setupTwoSided()
        const otherLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        mockClerkSession({
            userId: researcher.id,
            clerkUserId: researcher.clerkId,
            email: researcher.email ?? undefined,
            orgSlug: lab.slug,
            orgId: lab.id,
            orgType: 'lab',
            extraOrgs: [{ slug: otherLab.slug, id: otherLab.id, type: 'lab' }],
        })

        const result = await recordJobFileActivityAction({
            jobId: job.id,
            orgSlug: otherLab.slug,
            files: [{ studyJobFileId: archive.id, filePath: 'run.log' }],
            action: 'VIEWED',
        })

        expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
    })
})

describe('fetchJobFileActivityAction', () => {
    test('returns nothing before any activity', async () => {
        const { job, orgSlug } = await setup()

        expect(actionResult(await fetchJobFileActivityAction({ jobId: job.id, orgSlug }))).toEqual([])
    })

    test('returns the actor name alongside the action', async () => {
        const { job, archive, user, orgSlug } = await setup()

        actionResult(
            await recordJobFileActivityAction({
                jobId: job.id,
                orgSlug,
                files: [{ studyJobFileId: archive.id, filePath: 'run.log' }],
                action: 'DOWNLOADED',
            }),
        )

        const activity = actionResult(await fetchJobFileActivityAction({ jobId: job.id, orgSlug }))
        expect(activity).toHaveLength(1)
        expect(activity[0]).toMatchObject({
            studyJobFileId: archive.id,
            filePath: 'run.log',
            action: 'DOWNLOADED',
        })
        const dbUser = await db
            .selectFrom('user')
            .select('fullName')
            .where('id', '=', user.id)
            .executeTakeFirstOrThrow()
        expect(activity[0].actorName).toBe(dbUser.fullName)
    })

    test('collapses each file to its most recent action', async () => {
        const { job, archive, orgSlug } = await setup()

        await viewRunLog(job.id, orgSlug, archive.id)
        actionResult(
            await recordJobFileActivityAction({
                jobId: job.id,
                orgSlug,
                files: [{ studyJobFileId: archive.id, filePath: 'run.log' }],
                action: 'DOWNLOADED',
            }),
        )

        const activity = actionResult(await fetchJobFileActivityAction({ jobId: job.id, orgSlug }))
        expect(activity).toHaveLength(1)
        expect(activity[0].action).toBe('DOWNLOADED')
    })

    test('keeps activity separate per inner file of the same archive', async () => {
        const { job, archive, orgSlug } = await setup()

        await viewRunLog(job.id, orgSlug, archive.id)

        const activity = actionResult(await fetchJobFileActivityAction({ jobId: job.id, orgSlug }))
        expect(activity).toHaveLength(1)
        expect(activity[0].filePath).toBe('run.log')
    })

    // OTTER-783: the Research Lab saw the Data Partner's reviewers in "Last activity" and vice versa.
    test('shows each side of the study only its own activity', async () => {
        const { enclave, lab, reviewer, researcher, job, archive } = await setupTwoSided()

        actAs(reviewer, enclave)
        await viewRunLog(job.id, enclave.slug, archive.id)

        actAs(researcher, lab)
        const labView = actionResult(await fetchJobFileActivityAction({ jobId: job.id, orgSlug: lab.slug }))
        expect(labView).toEqual([])

        await viewRunLog(job.id, lab.slug, archive.id)
        const labViewAfter = actionResult(await fetchJobFileActivityAction({ jobId: job.id, orgSlug: lab.slug }))
        expect(labViewAfter).toHaveLength(1)
        expect(labViewAfter[0].actorName).toBe(researcher.fullName)

        actAs(reviewer, enclave)
        const enclaveView = actionResult(await fetchJobFileActivityAction({ jobId: job.id, orgSlug: enclave.slug }))
        expect(enclaveView).toHaveLength(1)
        expect(enclaveView[0].actorName).toBe(reviewer.fullName)
    })
})
