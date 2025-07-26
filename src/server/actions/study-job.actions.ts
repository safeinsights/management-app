'use server'

import { JobFile, minimalJobInfoSchema } from '@/lib/types'
import { fetchFileContents, storeApprovedJobFile } from '@/server/storage'
import { revalidatePath } from 'next/cache'
import { getStudyJobInfo, latestJobForStudy } from '@/server/db/queries'
import { sendStudyResultsRejectedEmail } from '@/server/mailer'
import { ActionFailure } from '@/lib/errors'
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
    .middleware(async ({ jobInfo }, { db }) => {
        const study = await db.selectFrom('study').select('orgId').where('id', '=', jobInfo.studyId).executeTakeFirstOrThrow()
        return { orgId: study.orgId }
    })
    .requireAbilityTo('approve', 'Study')
    .handler(async ({ params: { jobInfo: info, jobFiles }, session, db }) => {
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
    .middleware(async ({ studyId }, { db }) => {
        const study = await db.selectFrom('study').select('orgId').where('id', '=', studyId).executeTakeFirstOrThrow()
        return { orgId: study.orgId }
    })
    .requireAbilityTo('reject', 'Study')
    .handler(async ({ params: info, session, db }) => {
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
    .params(z.object({ studyJobId: z.string() }))
    .middleware(async ({ studyJobId }, { db }) => {
        const studyJob = await getStudyJobInfo(studyJobId)
        return { studyJob, orgId: studyJob.orgId } // Return the jobInfo along with the orgId for validation in requireAbilityTo below
    })
    .requireAbilityTo('view', 'StudyJob')
    .handler(async ({ studyJob }) => {
        return studyJob
    })

export const latestJobForStudyAction = new Action('latestJobForStudyAction')
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ studyId }, { session, db }) => {
        if (!session) throw new ActionFailure({ user: 'Unauthorized' })

        const studyJob = await latestJobForStudy(studyId)
        return { studyJob, orgId: studyJob.orgId } // Return the job along with the orgId for validation in requireAbilityTo below
    })
    .requireAbilityTo('view', 'StudyJob')
    .handler(async ({ studyJob }) => studyJob)

export const fetchApprovedJobFilesAction = new Action('fetchApprovedJobFilesAction')
    .params(z.object({ studyJobId: z.string() }))
    .middleware(async ({ studyJobId }, { db }) => {
        const studyJob = await getStudyJobInfo(studyJobId)
        return { studyJob, orgId: studyJob.orgId } // Return the jobInfo along with the orgId for validation in requireAbilityTo below
    })
    .requireAbilityTo('view', 'StudyJob')

    .handler(async ({ studyJob }) => {
        const approvedJobFiles = studyJob.files.filter(
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
    .middleware(async ({ jobId }, { db }) => {
        const studyJob = await getStudyJobInfo(jobId)
        return { studyJob, orgId: studyJob.orgId } // Return the jobInfo along with the orgId for validation in requireAbilityTo below
    })
    .requireAbilityTo('view', 'StudyJob')

    .handler(async ({ studyJob }) => {
        const encryptedFiles = studyJob.files.filter(
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
