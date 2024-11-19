'use server'

import { SIMULATE_RESULTS_UPLOAD, USING_CONTAINER_REGISTRY } from '@/server/config'
import { db } from '@/database'

export const onFetchStudyRunsAction = async (studyId: string) => {
    const runs = await db
        .selectFrom('studyRun')
        .select(['id', 'status', 'resultsPath', 'startedAt', 'uploadedAt', 'createdAt', 'completedAt'])
        .where('studyId', '=', studyId)
        .orderBy('startedAt', 'desc')
        .orderBy('createdAt', 'desc')
        .execute()

    return runs
}
