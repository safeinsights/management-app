'use server'

import { db, jsonArrayFrom } from '@/database'
import { minimalJobInfoSchema } from '@/lib/types'
import { fetchFileContents, storeStudyApprovedLogFile, storeStudyApprovedResultsFile } from '@/server/storage'
import {
    actionContext,
    checkMemberOfOrgWithSlug,
    getUserIdFromActionContext,
    orgAction,
    userAction,
    z,
} from './wrappers'
import { revalidatePath } from 'next/cache'

import {
    checkUserAllowedJobView,
    checkUserAllowedStudyReview,
    getStudyJobFileOfType,
    latestJobForStudy,
    siUser,
} from '@/server/db/queries'
import { sendStudyResultsApprovedEmail, sendStudyResultsRejectedEmail } from '@/server/mailer'
import { throwNotFound } from '@/lib/errors'

const approveStudyJobFileActionSchema = z.object({
    orgSlug: z.string(),
    jobInfo: minimalJobInfoSchema,
    jobFiles: z.array(
        z.object({
            path: z.string(),
            contents: z.instanceof(ArrayBuffer),
        }),
    ),
})

export const approveStudyJobLogsAction = orgAction(async ({ jobInfo: info, jobFiles }) => {
    await checkUserAllowedStudyReview(info.studyId)

    // FIXME: handle more than a single result. will require a db schema change
    const log = jobFiles[0]
    const logFile = new File([log.contents], log.path)
    await storeStudyApprovedLogFile(info, logFile)
    const user = await siUser()
    await db
        .insertInto('jobStatusChange')
        .values({
            userId: user.id,
            status: 'RESULTS-APPROVED',
            studyJobId: info.studyJobId,
        })
        .executeTakeFirstOrThrow()

    await sendStudyResultsApprovedEmail(info.studyId)

    revalidatePath(`/reviewer/[orgSlug]/study/${info.studyId}`)
}, approveStudyJobFileActionSchema)

export const approveStudyJobResultsAction = orgAction(async ({ jobInfo: info, jobFiles }) => {
    await checkUserAllowedStudyReview(info.studyId)

    // FIXME: handle more than a single result. will require a db schema change
    const result = jobFiles[0]
    const resultsFile = new File([result.contents], result.path)
    await storeStudyApprovedResultsFile(info, resultsFile)
    const user = await siUser()
    await db
        .insertInto('jobStatusChange')
        .values({
            userId: user.id,
            status: 'RESULTS-APPROVED',
            studyJobId: info.studyJobId,
        })
        .executeTakeFirstOrThrow()

    await sendStudyResultsApprovedEmail(info.studyId)
    revalidatePath(`/reviewer/[orgSlug]/study/${info.studyId}`)
}, approveStudyJobFileActionSchema)

export const rejectStudyJobFilesAction = orgAction(
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
        await sendStudyResultsRejectedEmail(info.studyId)

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
        .select((eb) => [
            'studyJob.id as studyJobId',
            'studyJob.studyId',
            'studyJob.createdAt',
            'study.title as studyTitle',
            'org.slug as orgSlug',
            jsonArrayFrom(
                eb
                    .selectFrom('jobStatusChange')
                    .select(['status', 'createdAt'])
                    .whereRef('jobStatusChange.studyJobId', '=', 'studyJob.id')
                    .orderBy('createdAt', 'desc'),
            ).as('statusChanges'),
            jsonArrayFrom(
                eb
                    .selectFrom('studyJobFile')
                    .select(['name', 'fileType'])
                    .whereRef('studyJobFile.studyJobId', '=', 'studyJob.id'),
            ).as('files'),
        ])
        .where('studyJob.id', '=', studyJobId)
        .executeTakeFirstOrThrow(throwNotFound(`job for study job id ${studyJobId}`))

    return jobInfo
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

export const fetchJobLogsAction = userAction(async (jobId) => {
    await checkUserAllowedJobView(jobId)
    const info = await getStudyJobFileOfType(jobId, 'APPROVED-LOG')
    const body = await fetchFileContents(info.path)

    return { path: info.path, contents: await body.text() }
}, z.string())

export const fetchJobLogsZipAction = orgAction(
    async ({ jobId, orgSlug }) => {
        await checkMemberOfOrgWithSlug(orgSlug)
        const info = await getStudyJobFileOfType(jobId, 'ENCRYPTED-LOG')
        const body = await fetchFileContents(info.path)
        return body
    },
    z.object({
        jobId: z.string(),
        orgSlug: z.string(),
    }),
)

export const fetchJobResultsCsvAction = userAction(async (jobId) => {
    await checkUserAllowedJobView(jobId)
    const info = await getStudyJobFileOfType(jobId, 'APPROVED-RESULT')
    const body = await fetchFileContents(info.path)

    return { path: info.path, contents: await body.text() }
}, z.string())

export const fetchJobResultsEncryptedZipAction = orgAction(
    async ({ jobId, orgSlug }) => {
        await checkMemberOfOrgWithSlug(orgSlug)
        const info = await getStudyJobFileOfType(jobId, 'ENCRYPTED-RESULT')
        const body = await fetchFileContents(info.path)
        return body
    },
    z.object({
        jobId: z.string(),
        orgSlug: z.string(),
    }),
)
