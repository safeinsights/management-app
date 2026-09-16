'use server'

import type { DBExecutor } from '@/database'
import { getOrgBySlug, type UserSession } from '@/lib/types'
import { getStudyJobInfo, latestActivityPerJobFile } from '@/server/db/queries'
import { Action, ActionFailure, z } from './action'

const jobFileRefSchema = z.object({ studyJobFileId: z.string(), filePath: z.string() })

const jobFileActivitySchema = z.object({
    jobId: z.string(),
    // The org whose pages the caller is on; decides which side's activity is written and read.
    orgSlug: z.string(),
    // "Download all" records the same action against every file in one round trip.
    files: z.array(jobFileRefSchema).min(1),
    action: z.enum(['VIEWED', 'DOWNLOADED']),
})

const loadStudyJob = async ({ params: { jobId } }: { params: { jobId: string } }) => {
    const studyJob = await getStudyJobInfo(jobId)
    return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId, status: studyJob.status }
}

type ActivityOrgContext = {
    params: { orgSlug: string }
    session: UserSession
    studyJob: { studyJobId: string; orgId: string; submittedByOrgId: string }
    db: DBExecutor
}

// The URL org is the caller's claim about which side of the study they act for. Pinned to the
// study's two parties AND the caller's own memberships, or a lab member could name the Data
// Partner's slug and read its reviewers' activity (OTTER-783).
const resolveActivityOrg = async ({ params: { orgSlug }, session, studyJob, db }: ActivityOrgContext) => {
    const org = await db.selectFrom('org').select('id').where('slug', '=', orgSlug).executeTakeFirst()
    const isParty = org?.id === studyJob.orgId || org?.id === studyJob.submittedByOrgId
    const isMember = Boolean(getOrgBySlug(session, orgSlug)) || session.user.isSiAdmin
    if (!org || !isParty || !isMember) {
        throw new ActionFailure({
            permission_denied: `org ${orgSlug} is not a party to job ${studyJob.studyJobId} that the caller belongs to`,
        })
    }
    return { activityOrgId: org.id }
}

// Gated on 'view StudyJob' rather than an approve/reject ability: looking at a file is exactly
// what a viewer is allowed to do (OTTER-675).
export const recordJobFileActivityAction = new Action('recordJobFileActivityAction', { performsMutations: true })
    .params(jobFileActivitySchema)
    .middleware(loadStudyJob)
    .requireAbilityTo('view', 'StudyJob')
    .middleware(resolveActivityOrg)
    .handler(async ({ params: { jobId, files, action }, session, db, activityOrgId }) => {
        // Scoped to this job's archives, so a forged id cannot attach activity to another study.
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
                orgId: activityOrgId,
                action,
            }))

        if (!rows.length) return

        await db.insertInto('studyJobFileActivity').values(rows).execute()
    })

export const fetchJobFileActivityAction = new Action('fetchJobFileActivityAction')
    .params(z.object({ jobId: z.string(), orgSlug: z.string() }))
    .middleware(loadStudyJob)
    .requireAbilityTo('view', 'StudyJob')
    .middleware(resolveActivityOrg)
    .handler(async ({ params: { jobId }, activityOrgId }) => {
        return await latestActivityPerJobFile(jobId, activityOrgId)
    })
