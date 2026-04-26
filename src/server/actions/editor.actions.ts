'use server'

import { throwNotFound } from '@/lib/errors'
import { Action, z } from './action'

export const getYjsDocumentUpdatedAtAction = new Action('getYjsDocumentUpdatedAtAction')
    .params(z.object({ documentName: z.string(), studyId: z.string() }))
    .middleware(async ({ params: { studyId }, db }) => {
        const study = await db
            .selectFrom('study')
            .select(['id', 'orgId', 'submittedByOrgId'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow(throwNotFound('study'))
        return { orgId: study.orgId, submittedByOrgId: study.submittedByOrgId }
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
