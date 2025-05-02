'use server'

import { db } from '@/database'
import { CodeManifest, minimalJobInfoSchema } from '@/lib/types'
import {
    fetchCodeManifest,
    fetchStudyApprovedResultsFile,
    fetchStudyEncryptedResultsFile,
    storeStudyResultsFile,
} from '@/server/storage'
import {
    z,
    orgAction,
    userAction,
    actionContext,
    checkMemberOfOrgWithSlug,
    getUserIdFromActionContext,
} from './wrappers'
import { revalidatePath } from 'next/cache'
import { checkUserAllowedJobView, latestJobForStudy, queryJobResult, siUser } from '@/server/db/queries'
import { checkUserAllowedStudyReview } from '../db/queries'
import { SanitizedError } from '@/lib/errors'

const approveStudyJobResultsActionSchema = z.object({
    orgSlug: z.string(),
    jobInfo: minimalJobInfoSchema,
    jobResults: z.array(
        z.object({
            path: z.string(),
            contents: z.instanceof(ArrayBuffer),
        }),
    ),
})

export const approveStudyJobResultsAction = orgAction(async ({ jobInfo: info, jobResults }) => {
    await checkUserAllowedStudyReview(info.studyId)

    // FIXME: handle more than a single result.  will require a db schema change
    const result = jobResults[0]

    const resultsFile = new File([result.contents], result.path)
    await storeStudyResultsFile({ ...info, resultsType: 'APPROVED', resultsPath: resultsFile.name }, resultsFile)

    const user = await siUser()
    await db
        .updateTable('studyJob')
        .set({ resultsPath: resultsFile.name })
        .where('id', '=', info.studyJobId)
        .executeTakeFirstOrThrow()
    await db
        .insertInto('jobStatusChange')
        .values({
            userId: user.id,
            status: 'RESULTS-APPROVED',
            studyJobId: info.studyJobId,
        })
        .executeTakeFirstOrThrow()
    revalidatePath(`/reviewer/[orgSlug]/study/${info.studyId}`)
}, approveStudyJobResultsActionSchema)

export const rejectStudyJobResultsAction = orgAction(
    async (info) => {
        await checkUserAllowedStudyReview(info.studyId)

        await db
            .insertInto('jobStatusChange')
            .values({
                userId: (await siUser()).id,
                status: 'RESULTS-REJECTED',
                studyJobId: info.studyJobId,
            })
            .executeTakeFirstOrThrow()

        // TODO Confirm / Make sure we delete files from S3 when rejecting?

        revalidatePath(`/reviewer/[orgSlug]/study/${info.studyId}`)
    },
    minimalJobInfoSchema.extend({
        orgSlug: z.string(),
    }),
)

export const loadStudyJobAction = userAction(async (studyJobId) => {
    const userId = await getUserIdFromActionContext()

    const jobInfo = await db
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .innerJoin('org', 'study.orgId', 'org.id')
        .innerJoin('orgUser', (join) =>
            join.on('orgUser.userId', '=', userId).onRef('orgUser.orgId', '=', 'study.orgId'),
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
            'org.slug as orgSlug',
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
    const ctx = await actionContext()
    const latestJob = await latestJobForStudy(studyId, { orgSlug: ctx.org.slug, userId: ctx.user.id })

    // We should always have a job, something is wrong if we don't
    if (!latestJob) {
        throw new Error(`No job found for study id: ${studyId}`)
    }
    return latestJob
}, z.string())

export const fetchJobResultsCsvAction = userAction(async (jobId): Promise<string> => {
    await checkUserAllowedJobView(jobId)

    const job = await queryJobResult(jobId)

    // TODO This keeps spitting out a bunch of errors in the logs,
    //  should prob handle this a different way
    if (!job || job.resultsType != 'APPROVED') {
        throw new Error(`Job ${jobId} not found or does not have approved results`)
    }
    const body = await fetchStudyApprovedResultsFile(job)
    return body.text()
}, z.string())

export const fetchJobResultsEncryptedZipAction = orgAction(
    async ({ jobId, orgSlug }) => {
        await checkMemberOfOrgWithSlug(orgSlug)

        const job = await queryJobResult(jobId)

        if (!job) {
            throw new SanitizedError(`Job ${jobId} not found or does not have results`)
        }

        return await fetchStudyEncryptedResultsFile(job)
    },
    z.object({
        jobId: z.string(),
        orgSlug: z.string(),
    }),
)
