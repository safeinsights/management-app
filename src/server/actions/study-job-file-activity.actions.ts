'use server'

import { getStudyJobInfo, latestActivityPerJobFile } from '@/server/db/queries'
import { Action, z } from './action'

// One decrypted output file: the archive row it was extracted from, plus its inner path.
const jobFileRefSchema = z.object({ studyJobFileId: z.string(), filePath: z.string() })

const jobFileActivitySchema = z.object({
    jobId: z.string(),
    // A "Download all" click records the same action against every file in one round trip, so
    // this is a list rather than a single value.
    files: z.array(jobFileRefSchema).min(1),
    action: z.enum(['VIEWED', 'DOWNLOADED']),
})

// OTTER-675: internal events behind the outputs table's "Last activity" column. Writing is
// gated on 'view StudyJob' rather than an approve/reject ability: looking at a file is exactly
// what a viewer is allowed to do, and the row records that it happened.
export const recordJobFileActivityAction = new Action('recordJobFileActivityAction', { performsMutations: true })
    .params(jobFileActivitySchema)
    .middleware(async ({ params: { jobId } }) => {
        const studyJob = await getStudyJobInfo(jobId)
        return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId, status: studyJob.status }
    })
    .requireAbilityTo('view', 'StudyJob')
    .handler(async ({ params: { jobId, files, action }, session, db }) => {
        // Scope the insert to archives that really belong to this job, so a forged id cannot
        // attach activity to another study's file.
        const ownArchives = await db
            .selectFrom('studyJobFile')
            .select('id')
            .where('studyJobId', '=', jobId)
            .where(
                'id',
                'in',
                files.map((file) => file.studyJobFileId),
            )
            .execute()

        const ownIds = new Set(ownArchives.map((archive) => archive.id))
        const rows = files
            .filter((file) => ownIds.has(file.studyJobFileId))
            .map((file) => ({
                studyJobFileId: file.studyJobFileId,
                filePath: file.filePath,
                userId: session.user.id,
                action,
            }))

        if (!rows.length) return

        await db.insertInto('studyJobFileActivity').values(rows).execute()
    })

export const fetchJobFileActivityAction = new Action('fetchJobFileActivityAction')
    .params(z.object({ jobId: z.string() }))
    .middleware(async ({ params: { jobId } }) => {
        const studyJob = await getStudyJobInfo(jobId)
        return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId, status: studyJob.status }
    })
    .requireAbilityTo('view', 'StudyJob')
    .handler(async ({ params: { jobId } }) => {
        return await latestActivityPerJobFile(jobId)
    })
