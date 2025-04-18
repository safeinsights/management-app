'use server'

import { db } from '@/database'
import { CodeManifest, minimalJobInfoSchema } from '@/lib/types'
import {
    fetchCodeManifest,
    fetchStudyApprovedResultsFile,
    fetchStudyEncryptedResultsFile,
    storeStudyResultsFile,
} from '@/server/storage'
import { getUserIdFromActionContext, memberAction, userAction, actionContext, z } from './wrappers'
import { revalidatePath } from 'next/cache'
import { checkUserAllowedJobView, latestJobForStudy, queryJobResult, siUser } from '@/server/db/queries'
import { checkMemberAllowedStudyReview } from '../db/queries'
import { SanitizedError } from '@/lib/errors'

const approveStudyJobResultsActionSchema = z.object({
    jobInfo: minimalJobInfoSchema,
    jobResults: z.array(
        z.object({
            path: z.string(),
            contents: z.instanceof(ArrayBuffer),
        }),
    ),
})

export const approveStudyJobResultsAction = memberAction(async ({ jobInfo: info, jobResults }) => {
    await checkMemberAllowedStudyReview(info.studyId)

    // FIXME: handle more than a single result.  will require a db schema change
    const result = jobResults[0]

    const resultsFile = new File([result.contents], result.path)

    await storeStudyResultsFile({ ...info, resultsType: 'APPROVED', resultsPath: resultsFile.name }, resultsFile)

    const user = await siUser(false)

    await db.updateTable('studyJob').set({ resultsPath: resultsFile.name }).where('id', '=', info.studyJobId).execute()

    await db
        .insertInto('jobStatusChange')
        .values({
            userId: user?.id,
            status: 'RESULTS-APPROVED',
            studyJobId: info.studyJobId,
        })
        .execute()

    revalidatePath(`/member/[memberSlug]/study/${info.studyId}/job/${info.studyJobId}`)
    revalidatePath(`/member/[memberSlug]/study/${info.studyId}/review`)
}, approveStudyJobResultsActionSchema)

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

    revalidatePath(`/member/[memberSlug]/study/${info.studyId}/job/${info.studyJobId}`)
    revalidatePath(`/member/[memberSlug]/study/${info.studyId}/review`)
}, minimalJobInfoSchema)

export const loadStudyJobAction = userAction(async (studyJobId) => {
    const userId = await getUserIdFromActionContext()

    const jobInfo = await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('member', 'study.memberId', 'member.id')
        .innerJoin('memberUser', (join) =>
            join.on('memberUser.userId', '=', userId).onRef('memberUser.memberId', '=', 'study.memberId'),
        )
        .leftJoin('jobStatusChange', (join) =>
            join
                .onRef('jobStatusChange.studyJobId', '=', 'studyJob.id')
                .on('jobStatusChange.status', 'in', ['RESULTS-APPROVED', 'RESULTS-REJECTED']),
        )
        .select([
            'studyJob.id as studyJobId',
            'studyJob.studyId',
            'studyJob.createdAt',
            'study.title as studyTitle',
            'member.slug as memberSlug',
            'jobStatusChange.status as jobStatus',
            'jobStatusChange.createdAt as jobStatusCreatedAt',
        ])
        .where('studyJob.id', '=', studyJobId)
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

export const latestJobForStudyAction = userAction(async (studyId) => {
    const latestJob = await latestJobForStudy(studyId, await actionContext())

    // We should always have a job, something is wrong if we don't
    if (!latestJob) {
        throw new Error(`No job found for study id: ${studyId}`)
    }
    return latestJob
}, z.string())

export const fetchJobResultsCsvAction = userAction(async (jobId): Promise<string> => {
    await checkUserAllowedJobView(jobId)

    const job = await queryJobResult(jobId)

    if (!job || job.resultsType != 'APPROVED') {
        throw new Error(`Job ${jobId} not found or does not have approved results`)
    }
    const body = await fetchStudyApprovedResultsFile(job)
    return body.text()
}, z.string())

export const fetchJobResultsEncryptedZipAction = memberAction(async (jobId: string) => {
    const job = await queryJobResult(jobId)
    if (!job) {
        throw new SanitizedError(`Job ${jobId} not found or does not have results`)
    }

    return await fetchStudyEncryptedResultsFile(job)
}, z.string())
