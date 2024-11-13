'use server'

import { db } from '@/database'
import { StudyStatus } from '@/database/types'
import { uuidToB64 } from '@/lib/uuid'
import { revalidatePath } from 'next/cache'

const AllowedStatusChanges: Array<StudyStatus> = ['APPROVED', 'REJECTED'] as const

export const updateStudyStatusAction = async (studyId: string, status: StudyStatus) => {
    // TODO: check clerk session to ensure researcher can actually update this

    if (!AllowedStatusChanges.includes(status)) {
        throw new Error('Invalid status')
    }

    await db.updateTable('study').set({ status }).where('id', '=', studyId).executeTakeFirstOrThrow()

    revalidatePath(`/member/[memberIdentifier]/study/${uuidToB64(studyId)}`)
}

export const getStudyAction = async (studyId: string) => {
    return await db
        .selectFrom('study')
        .select(['id', 'title', 'description', 'status', 'dataSources', 'piName', 'containerLocation'])
        .where('id', '=', studyId)
        .executeTakeFirst()
}

export const onFetchStudyRunsAction = async (studyId: string) => {
    const runs = await db
        .selectFrom('studyRun')
        .select(['id', 'status', 'startedAt', 'createdAt'])
        .where('studyId', '=', studyId)
        .orderBy('startedAt', 'desc')
        .orderBy('createdAt', 'desc')
        .execute()

    return runs
}
