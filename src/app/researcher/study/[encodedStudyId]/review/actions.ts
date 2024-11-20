'use server'

import { promises as fs } from 'fs'
import { db } from '@/database'
import { StudyStatus } from '@/database/types'
import { uuidToB64 } from '@/lib/uuid'
import { revalidatePath } from 'next/cache'
import { attachSimulatedResultsToStudyRun, storageForResultsFile } from '@/server/results'
import { sleep } from '@/lib/util'
import { SIMULATE_RESULTS_UPLOAD, USING_CONTAINER_REGISTRY } from '@/server/config'
import { queryRunResult } from '@/server/queries'
import { fetchStudyRunResults } from '@/server/aws'

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

export const fetchRunResultsAction = async (runId: string) => {
    const run = await queryRunResult(runId)
    if (!run) {
        throw new Error(`Run ${runId} not found or does not have results`)
    }
    const storage = await storageForResultsFile(run)
    let csv = ''
    if (storage.s3) {
        const body = await fetchStudyRunResults(run)
        // TODO: handle other types of results that are not string/CSV
        csv = await body.transformToString('utf-8')
    }

    if (storage.file) {
        csv = await fs.readFile(storage.file, 'utf-8')
    }

    return csv
}
