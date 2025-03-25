'use server'

import { schema } from './schema'
import { db } from '@/database'
import { z, userAction, getUserIdFromActionContext } from '@/server/actions/wrappers'
import { pick } from 'remeda'

export const onUpdateStudyAction = userAction(
    async ({ studyId, study }) => {
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
            .where('researcherId', '=', getUserIdFromActionContext())
            .execute()
    },
    z.object({
        studyId: z.string(),
        study: schema,
    }),
)
