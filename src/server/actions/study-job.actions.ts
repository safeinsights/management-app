'use server'

import { db, jsonArrayFrom } from '@/database'
import { JobFile, minimalJobInfoSchema } from '@/lib/types'
import { fetchFileContents, storeApprovedJobFile } from '@/server/storage'
import {
    actionContext,
    checkMemberOfOrgWithSlug,
    getUserIdFromActionContext,
    orgAction,
    userAction,
    z,
} from './wrappers'
import { revalidatePath } from 'next/cache'
import { checkUserAllowedJobView, checkUserAllowedStudyReview, latestJobForStudy, siUser } from '@/server/db/queries'
import { sendStudyResultsRejectedEmail } from '@/server/mailer'
import { throwNotFound } from '@/lib/errors'
import { onStudyFilesApproved } from '@/server/events'

export const approveStudyJobFilesAction = orgAction(
    async ({ jobInfo: info, jobFiles }) => {
        await checkUserAllowedStudyReview(info.studyId)
        const user = await siUser()

        await db.transaction().execute(async (trx) => {
            const job = await trx
                .selectFrom('studyJob')
                .innerJoin('jobStatusChange', 'jobStatusChange.studyJobId', 'studyJob.id')
                .where('studyJob.id', '=', info.studyJobId)
                .select('jobStatusChange.status')
                .orderBy('jobStatusChange.createdAt', 'desc')
                .executeTakeFirst()

            if (job?.status === 'FILES-APPROVED') {
                console.warn(`Study job ${info.studyJobId} already approved.`)
                return
            }

            for (const jobFile of jobFiles) {
                const file = new File([jobFile.contents], jobFile.path)
                await storeApprovedJobFile(info, file, jobFile.fileType, jobFile.sourceId)
            }

            await trx
                .insertInto('jobStatusChange')
                .values({
                    userId: user.id,
                    status: 'FILES-APPROVED',
                    studyJobId: info.studyJobId,
                })
                .executeTakeFirstOrThrow()

            onStudyFilesApproved({ studyId: info.studyId, userId: user.id })
        })
    },
    z.object({
        orgSlug: z.string(),
        jobInfo: minimalJobInfoSchema,
        jobFiles: z.array(
            z.object({
                path: z.string(),
                contents: z.instanceof(ArrayBuffer),
                sourceId: z.string(),
                fileType: z.enum([
                    'APPROVED-LOG',
                    'APPROVED-RESULT',
                    'ENCRYPTED-LOG',
                    'ENCRYPTED-RESULT',
                    'MAIN-CODE',
                    'SUPPLEMENTAL-CODE',
                ]),
            }),
        ),
    }),
)

export const rejectStudyJobFilesAction = orgAction(
    async (info) => {
        await checkUserAllowedStudyReview(info.studyId)

        await db
            .insertInto('jobStatusChange')
            .values({
                userId: (await siUser()).id,
                status: 'FILES-REJECTED',
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
                    .select(['id', 'name', 'fileType', 'path'])
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

export const fetchApprovedJobFilesAction = userAction(async (jobId) => {
    await checkUserAllowedJobView(jobId)
    const job = await loadStudyJobAction(jobId)
    const approvedJobFiles = job.files.filter(
        (jobFile) => jobFile.fileType === 'APPROVED-LOG' || jobFile.fileType === 'APPROVED-RESULT',
    )

    const jobFiles: JobFile[] = []
    for (const jobFile of approvedJobFiles) {
        const blob = await fetchFileContents(jobFile.path)
        const contents = await blob.arrayBuffer()
        jobFiles.push({
            contents,
            path: jobFile.name,
            fileType: jobFile.fileType,
        })
    }

    return jobFiles
}, z.string())

export const fetchEncryptedJobFilesAction = orgAction(
    async ({ jobId, orgSlug }) => {
        await checkMemberOfOrgWithSlug(orgSlug)
        const job = await loadStudyJobAction(jobId)

        const encryptedFiles = job.files.filter(
            (file) => file.fileType === 'ENCRYPTED-LOG' || file.fileType === 'ENCRYPTED-RESULT',
        )

        const encryptedJobFiles = []
        for (const encryptedFile of encryptedFiles) {
            const blob = await fetchFileContents(encryptedFile.path)
            encryptedJobFiles.push({
                fileType: encryptedFile.fileType,
                sourceId: encryptedFile.id,
                blob: blob,
            })
        }

        return encryptedJobFiles
    },
    z.object({
        jobId: z.string(),
        orgSlug: z.string(),
    }),
)
