'use server'

import { promises as fs } from 'fs'
import { db } from '@/database'
import { attachSimulatedResultsToStudyJob, storageForResultsFile } from '@/server/results'
import { sleep } from '@/lib/util'
import { queryJobResult } from '@/server/queries'
import { SIMULATE_RESULTS_UPLOAD } from '@/server/config'
import { fetchStudyJobResults } from '@/server/aws'

export const onStudyJobCreateAction = async (studyId: string) => {
    const studyJob = await db
        .insertInto('studyJob')
        .values({
            studyId: studyId,
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    await db
        .insertInto('jobStatusChange')
        .values({
            studyJobId: studyJob.id,
            status: 'INITIATED',
        })
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
