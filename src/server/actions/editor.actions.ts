'use server'

import { throwNotFound } from '@/lib/errors'
import { Action, z } from './action'

export const getYjsDocumentUpdatedAtAction = new Action('getYjsDocumentUpdatedAtAction')
    .params(z.object({ documentName: z.string(), studyId: z.string() }))
    .middleware(async ({ params: { studyId }, db }) => {
        const study = await db
            .selectFrom('study')
            .select(['id', 'orgId', 'submittedByOrgId', 'status'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study'))
        return { orgId: study.orgId, submittedByOrgId: study.submittedByOrgId, status: study.status }
    })
    .requireAbilityTo('view', 'Study')
    .handler(async ({ db, params: { documentName } }) => {
        const row = await db
            .selectFrom('yjsDocument')
            .select('updatedAt')
            .where('name', '=', documentName)
            .executeTakeFirst()

        return row?.updatedAt?.toISOString() ?? null
    })

// Status-poll fallback for the multi-user kick-out flow. Used by clients that miss
// the live stateless event (e.g. fully disconnected from the editor service) to
// detect that a proposal has been submitted.
export const getStudyStatusAction = new Action('getStudyStatusAction')
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId }, db }) => {
        const study = await db
            .selectFrom('study')
            .select(['id', 'orgId', 'submittedByOrgId', 'status'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study'))
        return { orgId: study.orgId, submittedByOrgId: study.submittedByOrgId, status: study.status }
    })
    .requireAbilityTo('view', 'Study')
    .handler(async ({ db, params: { studyId } }) => {
        const row = await db
            .selectFrom('study')
            .select(['status', 'submittedAt'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study'))

        // Used by callers that gate editability on both study status AND the latest
        // job's status (e.g. code review). Backward-compatible: existing callers read
        // only `status`. Ordering matches latestJobForStudyQuery so both agree on
        // what "latest" means.
        const latestJobStatusRow = await db
            .selectFrom('jobStatusChange')
            .innerJoin('studyJob', 'studyJob.id', 'jobStatusChange.studyJobId')
            .select('jobStatusChange.status')
            .where('studyJob.studyId', '=', studyId)
            .orderBy('jobStatusChange.createdAt', 'desc')
            .orderBy('jobStatusChange.id', 'desc')
            .limit(1)
            .executeTakeFirst()

        return {
            status: row.status,
            submittedAt: row.submittedAt?.toISOString() ?? null,
            latestJobStatus: latestJobStatusRow?.status ?? null,
        }
    })
