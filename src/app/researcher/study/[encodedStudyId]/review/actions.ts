'use server'

import { db } from '@/database'
import { StudyStatus } from '@/database/types'
import { uuidToB64 } from '@/lib/uuid'
import { revalidatePath } from 'next/cache'
import { attachSimulatedResultsToStudyRun } from '@/server/results'
import { sleep } from '@/lib/util'
import { SIMULATE_RESULTS_UPLOAD, USING_CONTAINER_REGISTRY } from '@/server/config'

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

export const getLatestStudyRunAction = async ({ encodedStudyId }: { encodedStudyId: string }) => {
    return await db
        .selectFrom('study')
        .innerJoin('member', 'member.id', 'study.memberId')
        .select([
            'study.id',
            'study.title',
            'study.containerLocation',
            'member.name as memberName',
            ({ selectFrom }) =>
                selectFrom('studyRun')
                    .whereRef('study.id', '=', 'studyRun.studyId')
                    .select('id as runId')
                    .orderBy('study.createdAt desc')
                    .limit(1)
                    .as('pendingRunId'),
        ])
        .where('study.id', '=', uuidToB64(encodedStudyId))
        .executeTakeFirst()
}

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
