'use server'

import { promises as fs } from 'fs'
import { db } from '@/database'
import { StudyStatus } from '@/database/types'
import { uuidToB64 } from '@/lib/uuid'
import { revalidatePath } from 'next/cache'
import { attachSimulatedResultsToStudyJob, storageForResultsFile } from '@/server/results'
import { sleep } from '@/lib/util'
import { queryJobResult } from '@/server/queries'
import { SIMULATE_RESULTS_UPLOAD, USING_CONTAINER_REGISTRY } from '@/server/config'
import { fetchStudyJobResults } from '@/server/aws'

const AllowedStatusChanges: Array<StudyStatus> = ['APPROVED', 'REJECTED'] as const

export const updateStudyStatusAction = async (studyId: string, status: StudyStatus) => {
    // TODO: check clerk session to ensure researcher can actually update this

    if (!AllowedStatusChanges.includes(status)) {
        throw new Error('Invalid status')
    }

    await db.updateTable('study').set({ status }).where('id', '=', studyId).executeTakeFirstOrThrow()

    revalidatePath(`/member/[memberIdentifier]/study/${uuidToB64(studyId)}`)
}

export const onFetchStudyJobsAction = async (studyId: string) => {
    const jobs = await db
        .selectFrom('studyJob')
        .select(['id', 'status', 'startedAt', 'createdAt'])
        .where('studyId', '=', studyId)
        .orderBy('startedAt', 'desc')
        .orderBy('createdAt', 'desc')
        .execute()

    return jobs
}

export const onStudyJobCreateAction = async (studyId: string) => {
    const studyJob = await db
        .insertInto('studyJob')
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
            attachSimulatedResultsToStudyJob({
                studyId,
                studyJobId: studyJob.id,
                memberIdentifier: study.memberIdentifier,
            })
        })
    }

    return studyJob.id
}

export const fetchJobResultsAction = async (jobId: string) => {
    const job = await queryJobResult(jobId)
    if (!job) {
        throw new Error(`Job ${jobId} not found or does not have results`)
    }
    const storage = await storageForResultsFile(job)
    let csv = ''
    if (storage.s3) {
        const body = await fetchStudyJobResults(job)
        // TODO: handle other types of results that are not string/CSV
        csv = await body.transformToString('utf-8')
    }

    if (storage.file) {
        csv = await fs.readFile(storage.file, 'utf-8')
    }

    return csv
}
