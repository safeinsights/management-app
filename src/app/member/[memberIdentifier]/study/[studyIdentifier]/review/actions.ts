'use server'

import { db } from '@/database'
import { StudyStatus } from '@/database/types'
import { uuidToB64 } from '@/lib/uuid'
import { revalidatePath } from 'next/cache'

export const updateStudyStatusAction = async (studyId: string, status: StudyStatus) => {
    // TODO: check clerk session to ensure researcher can actually update this

    if (!['approved', 'rejected'].includes(status)) {
        throw new Error('Invalid status')
    }

    await db.updateTable('study').set({ status }).where('id', '=', studyId).executeTakeFirstOrThrow()

    revalidatePath(`/member/[memberIdentifier]/study/${uuidToB64(studyId)}`)
}

export const getStudyAction = async (studyId: string) => {
    return await db
        .selectFrom('study')
        .select(['id', 'title', 'description', 'status', 'dataSources', 'outputMimeType', 'piName', 'containerLocation'])
        .where('id', '=', studyId)
        .executeTakeFirst()
}
