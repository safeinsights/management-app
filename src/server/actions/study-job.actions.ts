'use server'

import { db } from '@/database'
import { CodeManifest } from '@/lib/types'
import { fetchCodeManifest, fetchStudyJobResults } from '@/server/aws'
import { revalidatePath } from 'next/cache'
import { minimalJobInfoShema } from '@/lib/types'
import { USING_S3_STORAGE } from '@/server/config'

import { attachResultsToStudyJob, storageForResultsFile } from '@/server/results'
import { queryJobResult, siUser } from '@/server/queries'
import { promises as fs } from 'fs'
import { getUserIdFromActionContext, memberAction, z } from './wrappers'
import { checkMemberAllowedStudyReview } from '../db/queries'
import { jsonArrayFrom } from 'kysely/helpers/postgres'

export const approveStudyJobResultsAction = memberAction(
    async ({ jobInfo: info, jobResults }) => {
        await checkMemberAllowedStudyReview(info.studyId, getUserIdFromActionContext())

        const blob = new Blob(jobResults, { type: 'text/csv' })
        const resultsFile = new File([blob], 'job_results.csv')
        await attachResultsToStudyJob(info, resultsFile, 'RESULTS-APPROVED')

        revalidatePath(`/member/[memberIdentifier]/study/${info.studyId}/job/${info.studyJobId}`)
        revalidatePath(`/member/[memberIdentifier]/study/${info.studyId}/review`)
    },
    z.object({
        jobInfo: minimalJobInfoShema,
        jobResults: z.array(z.string()),
    }),
)

export const rejectStudyJobResultsAction = memberAction(async (info) => {
    await checkMemberAllowedStudyReview(info.studyId)

    await db
        .insertInto('jobStatusChange')
        .values({
            userId: (await siUser()).id,
            status: 'RESULTS-REJECTED',
            studyJobId: info.studyJobId,
        })
        .executeTakeFirstOrThrow()

    // TODO Confirm / Make sure we delete files from S3 when rejecting?

    revalidatePath(`/member/[memberIdentifier]/study/${info.studyId}/job/${info.studyJobId}`)
    revalidatePath(`/member/[memberIdentifier]/study/${info.studyId}/review`)
}, minimalJobInfoShema)

export const dataForJobAction = memberAction(async (studyJobIdentifier) => {
    const jobInfo = await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('member', 'study.memberId', 'member.id')
        .innerJoin('memberUser', (join) =>
            join
                .on('memberUser.userId', '=', getUserIdFromActionContext())
                .onRef('memberUser.memberId', '=', 'study.memberId'),
        )
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
            manifest = await fetchCodeManifest(jobInfo)
        } catch (e) {
            console.error('Failed to fetch code manifest', e)
        }
    }

    return { jobInfo, manifest }
}, z.string())

export const latestJobForStudyAction = memberAction(async (studyId) => {
    const latestJob = await db
        .selectFrom('studyJob')
        .selectAll('studyJob')

        // security, check user has access to record
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('memberUser', (join) =>
            join
                .on('memberUser.userId', '=', getUserIdFromActionContext())
                .onRef('memberUser.memberId', '=', 'study.memberId'),
        )

        .where('studyJob.studyId', '=', studyId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .executeTakeFirst()

    // We should always have a job, something is wrong if we don't
    if (!latestJob) {
        throw new Error(`No job found for study id: ${studyId}`)
    }
    return latestJob
}, z.string())

export const jobStatusForJobAction = memberAction(async (jobId) => {
    if (!jobId) return null

    const result = await db
        .selectFrom('jobStatusChange')

        // security, check user has access to record
        .innerJoin('studyJob', 'studyJob.id', 'jobStatusChange.studyJobId')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('memberUser', (join) =>
            join
                .on('memberUser.userId', '=', getUserIdFromActionContext())
                .onRef('memberUser.memberId', '=', 'study.memberId'),
        )

        .select('jobStatusChange.status')
        .where('jobStatusChange.studyJobId', '=', jobId)
        .orderBy('jobStatusChange.createdAt', 'desc')
        .limit(1)
        .executeTakeFirst()

    return result?.status || null
}, z.string())

export const onFetchStudyJobsAction = memberAction(async (studyId) => {
    return await db
        .selectFrom('studyJob')
        .select('studyJob.id')
        // security, check user has access to record
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('memberUser', (join) =>
            join
                .on('memberUser.userId', '=', getUserIdFromActionContext())
                .onRef('memberUser.memberId', '=', 'study.memberId'),
        )
        .select((eb) => [
            jsonArrayFrom(
                eb
                    .selectFrom('jobStatusChange')
                    .select(['status', 'message', 'createdAt'])
                    .whereRef('jobStatusChange.studyJobId', '=', 'studyJob.id')
                    .orderBy('createdAt'),
            ).as('statuses'),
        ])
        .where('studyId', '=', studyId)
        .execute()
}, z.string())

export const fetchJobResultsCsvAction = memberAction(async (jobId: string): Promise<string> => {
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
}, z.string())

export const fetchJobResultsZipAction = memberAction(async (jobId: string): Promise<Blob> => {
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
}, z.string())
