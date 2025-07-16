'use server'

import { db, jsonArrayFrom } from '@/database'
import { JobFile, minimalJobInfoSchema } from '@/lib/types'
import { fetchFileContents, storeApprovedJobFile } from '@/server/storage'
import { revalidatePath } from 'next/cache'
import { latestJobForStudy } from '@/server/db/queries'
import { sendStudyResultsRejectedEmail } from '@/server/mailer'
import { throwNotFound } from '@/lib/errors'
import { onStudyFilesApproved } from '@/server/events'
import { Action, z } from './action'

export const approveStudyJobFilesAction = new Action('approveStudyJobFilesAction')
    .params(
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
    .requireAbilityTo('review', 'Study', ({ jobInfo }) => ({ studyId: jobInfo.studyId }))
    .handler(async ({ jobInfo: info, jobFiles }, { session }) => {
        for (const jobFile of jobFiles) {
            const file = new File([jobFile.contents], jobFile.path)
            await storeApprovedJobFile(info, file, jobFile.fileType, jobFile.sourceId)
        }

        await db
            .insertInto('jobStatusChange')
            .values({
                userId: session.user.id,
                status: 'FILES-APPROVED',
                studyJobId: info.studyJobId,
            })
            .executeTakeFirstOrThrow()

        onStudyFilesApproved({ studyId: info.studyId, userId: session.user.id })
    })

export const rejectStudyJobFilesAction = new Action('rejectStudyJobFilesAction')
    .params(
        minimalJobInfoSchema.extend({
            orgSlug: z.string(),
        }),
    )
    .requireAbilityTo('review', 'Study', ({ studyId }) => ({ studyId }))
    .handler(async (info, { session }) => {
        await db
            .insertInto('jobStatusChange')
            .values({
                userId: session.user.id,
                status: 'FILES-REJECTED',
                studyJobId: info.studyJobId,
            })
            .executeTakeFirstOrThrow()

        // TODO Confirm / Make sure we delete files from S3 when rejecting?
        await sendStudyResultsRejectedEmail(info.studyId)

        revalidatePath(`/reviewer/[orgSlug]/study/${info.studyId}`)
    })

export const loadStudyJobAction = new Action('loadStudyJobAction')
    .params(z.string())
    .requireAbilityTo('read', 'StudyJob', (studyJobId) => ({ studyJobId }))
    .handler(async (studyJobId, { session }) => {
        const jobInfo = await db
            .selectFrom('studyJob')
            .innerJoin('study', 'study.id', 'studyJob.studyId')
            .innerJoin('org', 'study.orgId', 'org.id')
            .innerJoin('orgUser', (join) =>
                join.on('orgUser.userId', '=', session.user.id).onRef('orgUser.orgId', '=', 'study.orgId'),
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
    })

export const latestJobForStudyAction = new Action('latestJobForStudyAction')
    .params(z.string())
    .requireAbilityTo('read', 'Study', (studyId) => ({ studyId }))
    .handler(async (studyId, { session }) => {
        const latestJob = await latestJobForStudy(studyId, {
            orgSlug: session.org?.slug,
            userId: session.user.id,
        })

        // We should always have a job, something is wrong if we don't
        if (!latestJob) {
            throw new Error(`No job found for study id: ${studyId}`)
        }
        return latestJob
    })

export const fetchApprovedJobFilesAction = new Action('fetchApprovedJobFilesAction')
    .params(z.string())
    .requireAbilityTo('read', 'StudyJob', (jobId) => ({ jobId }))
    .handler(async (jobId) => {
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
    })

export const fetchEncryptedJobFilesAction = new Action('fetchEncryptedJobFilesAction')
    .params(
        z.object({
            jobId: z.string(),
            orgSlug: z.string(),
        }),
    )
    .requireAbilityTo('read', 'Organization', ({ orgSlug }) => ({ orgSlug }))
    .handler(async ({ jobId }) => {
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
    })