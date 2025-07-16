'use server'

import { db } from '@/database'
import { pick } from 'remeda'
import { Action, z } from '@/server/actions/action'
import { schema } from './schema'

export const onUpdateStudyAction = new Action('onUpdateStudyAction')
    .params(
        z.object({
            studyId: z.string(),
            study: schema,
        }),
    )
    .middleware(async ({ studyId }) => {
        const study = await db.selectFrom('study').select('orgId').where('id', '=', studyId).executeTakeFirst()
        return { orgId: study?.orgId }
    })
    .requireAbilityTo('update', 'Study', ({ studyId }, { orgId }) => ({ id: studyId, orgId: orgId as string }))
    .handler(async ({ studyId, study }, { session }) => {
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
