'use server'

import { db } from '@/database'
import { pick } from 'remeda'
import { Action, z } from '@/server/actions/action'
import { schema } from './schema'
import { throwNotFound } from '@/lib/errors'

export const onUpdateStudyAction = new Action('onUpdateStudyAction')
    .params(
        z.object({
            studyId: z.string(),
            study: schema,
        }),
    )
    .middleware(async ({ studyId }) => {
    const study = await db.selectFrom('study').select('orgId').where('id', '=', studyId).executeTakeFirstOrThrow(throwNotFound('study'))
        return { orgId: study.orgId, id: studyId }
    })
    .requireAbilityTo('update', 'Study')
    .handler(async ({ params: { studyId, study }, session }) => {
        if (!session) throw new Error('Unauthorized')
        const userId = session.user.id

        const studyDataSources = [
            ...(study.eventCapture ? ['eventCapture'] : []),
            ...(study.highlights ? ['highlights'] : []),
            ...(study.containerLocation ? ['containerURL'] : []),
            ...(study.irbDocument ? ['IRB Document.pdf'] : []),
        ]

        await db
            .updateTable('study')
            .set({
                ...pick(study, ['piName', 'outputMimeType']),
                status: 'APPROVED',
                dataSources: studyDataSources,
            })
            .where('id', '=', studyId)
            // security: only allow updating studies that belong to the current user
            .where('researcherId', '=', userId)
            .execute()
    })
