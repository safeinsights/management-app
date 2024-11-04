'use server'

import { db } from '@/database'
import { StudyRunStatus } from '@/database/types'

export type StudyRun = {
    id: string
    status: StudyRunStatus
    startedAt: Date | null
    createdAt: Date
}

export const onRunCreateAction = async (studyId: string) => {
    const studyRunId = await db
        .insertInto('studyRun')
        .values({
            studyId: studyId,
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    return studyRunId.id
}

export const onFetchStudyRunsAction = async (studyId: string): Promise<StudyRun[]> => {
    const runs = await db
        .selectFrom('studyRun')
        .select(['id', 'status', 'startedAt', 'createdAt'])
        .where('studyId', '=', studyId)
        .orderBy('startedAt', 'desc')
        .orderBy('createdAt', 'desc')
        .execute()

    return runs
}
