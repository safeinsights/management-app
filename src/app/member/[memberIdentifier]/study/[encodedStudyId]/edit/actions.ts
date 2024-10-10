'use server'

import { FormValues, schema } from './schema'
import { db } from '@/database'
import { pick } from 'remeda'

export const onUpdateStudyAction = async (studyId: string, study: FormValues) => {
    schema.parse(study) // throws when malformed

    // TODO: check clerk session to ensure researcher can actually update this

    await db
        .updateTable('study')
        .set({
            ...pick(study, ['description', 'piName', 'outputFormat']),
            dataSources: [...(study.eventCapture ? ['eventCapture'] : []), ...(study.highlights ? ['highlights'] : [])],
        })
        .where('id', '=', studyId)
        .execute()
}
