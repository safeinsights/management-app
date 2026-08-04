import { describe, expect, test } from 'vitest'
import { actionResult, db, insertTestStudyJobData, mockSessionWithTestData } from '@/tests/unit.helpers'
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
    return { ...session, job, archive }
}

describe('recordJobFileActivityAction', () => {
    test('records a view against one inner file', async () => {
        const { job, archive, user } = await setup()

        actionResult(
            await recordJobFileActivityAction({
                jobId: job.id,
                files: [{ studyJobFileId: archive.id, filePath: 'run.log' }],
                action: 'VIEWED',
            }),
        )

        const rows = await db
            .selectFrom('studyJobFileActivity')
            .selectAll('studyJobFileActivity')
            .where('studyJobFileId', '=', archive.id)
            .execute()
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ action: 'VIEWED', filePath: 'run.log', userId: user.id })
    })

    // "Download all" is one round trip that has to land on every file, because the column reports
    // per-file activity rather than a single aggregate event.
    test('records one row per file for a bulk download', async () => {
        const { job, archive } = await setup()

        actionResult(
            await recordJobFileActivityAction({
                jobId: job.id,
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

    // A forged id must not be able to attach activity to another study's file.
    test('ignores archives that belong to a different job', async () => {
        const { job, org } = await setup()
        const { job: otherJob } = await insertTestStudyJobData({ org, jobStatus: 'JOB-ERRORED' })
        const foreignArchive = await insertArchive(otherJob.id, 'other.zip')

        actionResult(
            await recordJobFileActivityAction({
                jobId: job.id,
                files: [{ studyJobFileId: foreignArchive.id, filePath: 'run.log' }],
                action: 'VIEWED',
            }),
        )

        const rows = await db
            .selectFrom('studyJobFileActivity')
            .selectAll('studyJobFileActivity')
            .where('studyJobFileId', '=', foreignArchive.id)
            .execute()
        expect(rows).toHaveLength(0)
    })

    test('permission denied for an unrelated org', async () => {
        const { job, archive } = await setup()
        await mockSessionWithTestData({ orgSlug: 'unrelated-org', orgType: 'lab' })

        const result = await recordJobFileActivityAction({
            jobId: job.id,
            files: [{ studyJobFileId: archive.id, filePath: 'run.log' }],
            action: 'VIEWED',
        })

        expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
    })
})

describe('fetchJobFileActivityAction', () => {
    test('returns nothing before any activity', async () => {
        const { job } = await setup()

        expect(actionResult(await fetchJobFileActivityAction({ jobId: job.id }))).toEqual([])
    })

    test('returns the actor name alongside the action', async () => {
        const { job, archive, user } = await setup()

        actionResult(
            await recordJobFileActivityAction({
                jobId: job.id,
                files: [{ studyJobFileId: archive.id, filePath: 'run.log' }],
                action: 'DOWNLOADED',
            }),
        )

        const activity = actionResult(await fetchJobFileActivityAction({ jobId: job.id }))
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

    // The column shows the latest action, not a history, so a later event must replace the
    // earlier one rather than stacking beside it.
    test('collapses each file to its most recent action', async () => {
        const { job, archive } = await setup()

        actionResult(
            await recordJobFileActivityAction({
                jobId: job.id,
                files: [{ studyJobFileId: archive.id, filePath: 'run.log' }],
                action: 'VIEWED',
            }),
        )
        actionResult(
            await recordJobFileActivityAction({
                jobId: job.id,
                files: [{ studyJobFileId: archive.id, filePath: 'run.log' }],
                action: 'DOWNLOADED',
            }),
        )

        const activity = actionResult(await fetchJobFileActivityAction({ jobId: job.id }))
        expect(activity).toHaveLength(1)
        expect(activity[0].action).toBe('DOWNLOADED')
    })

    test('keeps activity separate per inner file of the same archive', async () => {
        const { job, archive } = await setup()

        actionResult(
            await recordJobFileActivityAction({
                jobId: job.id,
                files: [{ studyJobFileId: archive.id, filePath: 'run.log' }],
                action: 'VIEWED',
            }),
        )

        const activity = actionResult(await fetchJobFileActivityAction({ jobId: job.id }))
        expect(activity).toHaveLength(1)
        expect(activity[0].filePath).toBe('run.log')
    })
})
