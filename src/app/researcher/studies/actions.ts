'use server'

import { SIMULATE_RESULTS_UPLOAD, USING_CONTAINER_REGISTRY } from '@/server/config'
import { db } from '@/database'
import { sleep } from '@/lib/util'
import { attachSimulatedResultsToStudyRun } from '@/server/results'

export const onStudyRunCreateAction = async (studyId: string) => {
    const studyRun = await db
        .insertInto('studyRun')
        .values({
            studyId: studyId,
            status: USING_CONTAINER_REGISTRY ? 'INITIATED' : 'CODE-SUBMITTED', // act as if code submitted when not using container registry
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    if (SIMULATE_RESULTS_UPLOAD) {
        const study = await db
            .selectFrom('study')
            .innerJoin('member', 'study.memberId', 'member.id')
            .select(['member.identifier as memberIdentifier'])
            .where('study.id', '=', studyId)
            .executeTakeFirstOrThrow()
        sleep({ 3: 'seconds' }).then(() => {
            attachSimulatedResultsToStudyRun({
                studyId,
                studyRunId: studyRun.id,
                memberIdentifier: study.memberIdentifier,
            })
        })
    }

    return studyRun.id
}
