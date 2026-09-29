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

// Status-poll fallback for clients that miss the live stateless kick-out event. `studyJobId` is for
// screens whose round is closed by a job status: the newest row alone can hide a decision, because an
// asynchronous CODE-SCANNED row may land after FILES-APPROVED on the same job (OTTER-726).
export const getStudyStatusAction = new Action('getStudyStatusAction')
    .params(z.object({ studyId: z.string(), studyJobId: z.string().optional() }))
    .middleware(async ({ params: { studyId }, db }) => {
        const study = await db
            .selectFrom('study')
            .select(['id', 'orgId', 'submittedByOrgId', 'status'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study'))
        return { orgId: study.orgId, submittedByOrgId: study.submittedByOrgId, status: study.status }
    })
    .requireAbilityTo('view', 'Study')
    .handler(async ({ db, params: { studyId, studyJobId } }) => {
        const row = await db
            .selectFrom('study')
            .select(['status', 'submittedAt'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study'))

        // Ordering matches latestJobForStudyQuery so both agree on what "latest" means.
        const latestJobStatusRow = await db
            .selectFrom('jobStatusChange')
            .innerJoin('studyJob', 'studyJob.id', 'jobStatusChange.studyJobId')
            .select('jobStatusChange.status')
            .where('studyJob.studyId', '=', studyId)
            .orderBy('jobStatusChange.createdAt', 'desc')
            .orderBy('jobStatusChange.id', 'desc')
            .limit(1)
            .executeTakeFirst()

        // Joined through the study so a job id from another study yields nothing.
        const jobStatusRows = studyJobId
            ? await db
                  .selectFrom('jobStatusChange')
                  .innerJoin('studyJob', 'studyJob.id', 'jobStatusChange.studyJobId')
                  .select('jobStatusChange.status')
                  .where('studyJob.studyId', '=', studyId)
                  .where('studyJob.id', '=', studyJobId)
                  .orderBy('jobStatusChange.createdAt', 'asc')
                  .orderBy('jobStatusChange.id', 'asc')
                  .execute()
            : []

        return {
            status: row.status,
            submittedAt: row.submittedAt?.toISOString() ?? null,
            latestJobStatus: latestJobStatusRow?.status ?? null,
            jobStatuses: jobStatusRows.map((change) => change.status),
        }
    })
