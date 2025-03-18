'use server'

import { FormValues, schema } from './schema'
import { db } from '@/database'
import { pick } from 'remeda'

export const onUpdateStudyAction = async (studyId: string, study: FormValues) => {
    schema.parse(study) // throws when malformed

    // TODO: check clerk session to ensure researcher can actually update this
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
        .execute()
}
