'use server'

import { db } from '@/database'
import { CodeManifest, MinimalJobInfo } from '@/lib/types'
import { fetchCodeManifest, fetchStudyJobResults } from '@/server/aws'
import { revalidatePath } from 'next/cache'
import { USING_S3_STORAGE } from '@/server/config'
import { devReadCodeFile } from '@/server/dev/code-files'
import { attachResultsToStudyJob, storageForResultsFile } from '@/server/results'
import { queryJobResult, siUser } from '@/server/queries'
import { promises as fs } from 'fs'

export const approveStudyJobResults = async (info: MinimalJobInfo, results?: string[]) => {
    const blob = new Blob(results, { type: 'text/csv' })
    const resultsFile = new File([blob], 'job_results.csv')
    await attachResultsToStudyJob(info, resultsFile, 'RESULTS-APPROVED')

    revalidatePath(`/member/[memberIdentifier]/study/${info.studyId}/job/${info.studyJobId}`)
    revalidatePath(`/member/[memberIdentifier]/study/${info.studyId}/review`)
}

export const rejectStudyJobResults = async (info: MinimalJobInfo) => {
    await db
        .insertInto('jobStatusChange')
        .values({
            userId: (await siUser()).id,
            status: 'RESULTS-REJECTED',
            studyJobId: info.studyJobId,
        })
        .executeTakeFirstOrThrow()

    revalidatePath(`/member/[memberIdentifier]/study/${info.studyId}/job/${info.studyJobId}`)
    revalidatePath(`/member/[memberIdentifier]/study/${info.studyId}/review`)
}

export const dataForJobAction = async (studyJobIdentifier: string) => {
    const jobInfo = await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('member', 'study.memberId', 'member.id')
        .select([
            'studyJob.id as studyJobId',
            'studyJob.studyId',
            'studyJob.createdAt',
            'study.title as studyTitle',
            'member.identifier as memberIdentifier',
        ])
        .where('studyJob.id', '=', studyJobIdentifier)
        .executeTakeFirst()

    let manifest: CodeManifest = {
        jobId: '',
        language: 'r',
        files: {},
        size: 0,
        tree: { label: '', value: '', size: 0, children: [] },
    }

    if (jobInfo) {
        try {
            if (USING_S3_STORAGE) {
                manifest = await fetchCodeManifest(jobInfo)
            } else {
                const buf = await devReadCodeFile(jobInfo, 'manifest.json')
                manifest = JSON.parse(buf.toString('utf-8'))
            }
        } catch (e) {
            console.error('Failed to fetch code manifest', e)
        }
    }

    return { jobInfo, manifest }
}

export const dataForStudyDocumentsAction = async (studyId: string) => {
    // Fetch study information
    const studyInfo = await db
        .selectFrom('study')
        .innerJoin('member', 'study.memberId', 'member.id')
        .select([
            'study.id as studyId',
            'study.title as studyTitle',
            'study.descriptionDocPath',
            'study.irbDocPath',
            // 'study.agreementsDocPath', //TODO:column does not exist yet
            'member.identifier as memberIdentifier',
        ])
        .where('study.id', '=', studyId)
        .executeTakeFirst()

    if (!studyInfo) {
        return null
    }

    // Prepare document list
    const documents = []
    
    if (studyInfo.descriptionDocPath) {
        documents.push({
            name: 'Description Document',
            path: studyInfo.descriptionDocPath
        })
    }

    if (studyInfo.irbDocPath) {
        documents.push({
            name: 'IRB Document',
            path: studyInfo.irbDocPath
        })
    }

    // TODO:column does not exist yet
    // if (studyInfo.agreementsDocPath) {
    //     documents.push({
    //         name: 'Agreements Document',
    //         path: studyInfo.agreementsDocPath
    //     })
    // }

    return { 
        studyInfo, 
        documents 
    }
}



export const latestJobForStudy = async (studyId: string) => {
    return await db
        .selectFrom('studyJob')
        .selectAll()
        .where('studyJob.studyId', '=', studyId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .executeTakeFirst()
}

export const jobStatusForJob = async (jobId: string | undefined) => {
    if (!jobId) return null

    const result = await db
        .selectFrom('jobStatusChange')
        .select('status')
        .where('jobStatusChange.studyJobId', '=', jobId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .executeTakeFirst()

    return result?.status || null
}

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

    return studyJob.id
}

export const fetchJobResultsCsvAction = async (jobId: string): Promise<string> => {
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
    } else if (storage.file) {
        csv = await fs.readFile(storage.file, 'utf-8')
    } else {
        throw new Error('Unknown storage type')
    }

    return csv
}

export const fetchJobResultsZipAction = async (jobId: string): Promise<Blob> => {
    const job = await queryJobResult(jobId)
    if (!job) {
        throw new Error(`Job ${jobId} not found or does not have results`)
    }
    const storage = await storageForResultsFile(job)
    if (storage.s3) {
        const body = await fetchStudyJobResults(job)
        return body
            .transformToWebStream()
            .getReader()
            .read()
            .then(({ value }) => new Blob([value]))
    } else if (storage.file) {
        return new Blob([await fs.readFile(storage.file)])
    } else {
        throw new Error('Unknown storage type')
    }
}
