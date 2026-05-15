'use server'

import { ActionFailure } from '@/lib/errors'
import { isApprovedLogType, isEncryptedLogType } from '@/lib/file-type-helpers'
import { JobFile, jobFileSchema, minimalJobInfoSchema } from '@/lib/types'
import { getStudyJobInfo, getStudyReviewForJob, latestJobForStudy } from '@/server/db/queries'
import { onStudyResultsApproved, onStudyResultsRejected } from '@/server/events'
import { fetchFileContents, storeApprovedJobFile } from '@/server/storage'
import { ResultsReader } from 'si-encryption/job-results/reader'
import { Action, z } from './action'

export const approveStudyJobFilesAction = new Action('approveStudyJobFilesAction', { performsMutations: true })
    .params(
        z.object({
            orgSlug: z.string(),
            jobInfo: minimalJobInfoSchema,
            jobFiles: z.array(jobFileSchema),
        }),
    )
    .middleware(async ({ params: { jobInfo }, db }) => {
        const study = await db
            .selectFrom('study')
            .select('orgId')
            .where('id', '=', jobInfo.studyId)
            .executeTakeFirstOrThrow()
        return { orgId: study.orgId }
    })
    .requireAbilityTo('approve', 'Study')
    .handler(async ({ params: { jobInfo: info, jobFiles }, session, db }) => {
        // Lock the studyJob row so a concurrent reject (or duplicate approve) is forced to
        // serialize behind us. The post-lock re-check below turns the SELECT/INSERT into a
        // real CAS, and inserting the terminal row before any S3 write means a losing race
        // refuses without leaving orphan approved files in storage.
        await db.selectFrom('studyJob').select('id').where('id', '=', info.studyJobId).forUpdate().execute()

        const prior = await db
            .selectFrom('jobStatusChange')
            .select('status')
            .where('studyJobId', '=', info.studyJobId)
            .where('status', 'in', ['FILES-APPROVED', 'FILES-REJECTED'])
            .executeTakeFirst()

        if (prior) {
            throw new ActionFailure({ studyJob: 'results have already been reviewed' })
        }

        await db
            .insertInto('jobStatusChange')
            .values({
                userId: session.user.id,
                status: 'FILES-APPROVED',
                studyJobId: info.studyJobId,
            })
            .executeTakeFirstOrThrow()

        for (const jobFile of jobFiles) {
            const file = new File([jobFile.contents], jobFile.path)
            await storeApprovedJobFile(info, file, jobFile.fileType, jobFile.sourceId)
        }

        onStudyResultsApproved({ studyId: info.studyId, userId: session.user.id })
    })

export const rejectStudyJobFilesAction = new Action('rejectStudyJobFilesAction', { performsMutations: true })
    .params(
        minimalJobInfoSchema.extend({
            orgSlug: z.string(),
        }),
    )
    .middleware(async ({ params: { studyId }, db }) => {
        const study = await db.selectFrom('study').select('orgId').where('id', '=', studyId).executeTakeFirstOrThrow()
        return { orgId: study.orgId }
    })
    .requireAbilityTo('reject', 'Study')
    .handler(async ({ params: info, session, db }) => {
        // Symmetric to approveStudyJobFilesAction: lock the studyJob row, re-check, then
        // insert. See the comment over there for the full reasoning.
        await db.selectFrom('studyJob').select('id').where('id', '=', info.studyJobId).forUpdate().execute()

        const prior = await db
            .selectFrom('jobStatusChange')
            .select('status')
            .where('studyJobId', '=', info.studyJobId)
            .where('status', 'in', ['FILES-APPROVED', 'FILES-REJECTED'])
            .executeTakeFirst()

        if (prior) {
            throw new ActionFailure({ studyJob: 'results have already been reviewed' })
        }

        await db
            .insertInto('jobStatusChange')
            .values({
                userId: session.user.id,
                status: 'FILES-REJECTED',
                studyJobId: info.studyJobId,
            })
            .executeTakeFirstOrThrow()

        // TODO Confirm / Make sure we delete files from S3 when rejecting?
        onStudyResultsRejected({ studyId: info.studyId, userId: session.user.id })
    })

export const loadStudyJobAction = new Action('loadStudyJobAction')
    .params(z.object({ studyJobId: z.string() }))
    .middleware(async ({ params: { studyJobId } }) => {
        const studyJob = await getStudyJobInfo(studyJobId)
        return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId } // Return the jobInfo along with the orgId for validation in requireAbilityTo below
    })
    .requireAbilityTo('view', 'StudyJob')
    .handler(async ({ studyJob }) => {
        return studyJob
    })

export const latestJobForStudyAction = new Action('latestJobForStudyAction')
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId }, session }) => {
        if (!session) throw new ActionFailure({ user: 'Unauthorized' })

        const studyJob = await latestJobForStudy(studyId)
        return { studyJob, orgId: studyJob.orgId } // Return the job along with the orgId for validation in requireAbilityTo below
    })
    .requireAbilityTo('view', 'StudyJob')
    .handler(async ({ studyJob }) => studyJob)

export const getStudyReviewAction = new Action('getStudyReviewAction')
    .params(z.object({ studyJobId: z.string() }))
    .middleware(async ({ params: { studyJobId } }) => {
        const studyJob = await getStudyJobInfo(studyJobId)
        return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId }
    })
    .requireAbilityTo('view', 'StudyJob')
    .handler(async ({ params: { studyJobId } }) => {
        return await getStudyReviewForJob(studyJobId)
    })

export const fetchApprovedJobFilesAction = new Action('fetchApprovedJobFilesAction')
    .params(z.object({ studyJobId: z.string() }))
    .middleware(async ({ params: { studyJobId } }) => {
        const studyJob = await getStudyJobInfo(studyJobId)
        return { studyJob, orgId: studyJob.orgId, submittedByOrgId: studyJob.submittedByOrgId } // Return the jobInfo along with the orgId for validation in requireAbilityTo below
    })
    .requireAbilityTo('view', 'StudyJob')

    .handler(async ({ studyJob }) => {
        const approvedJobFiles = studyJob.files.filter(
            (jobFile) => isApprovedLogType(jobFile.fileType) || jobFile.fileType === 'APPROVED-RESULT',
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
        }),
    )
    .middleware(async ({ params: { jobId } }) => {
        const studyJob = await getStudyJobInfo(jobId)
        return { studyJob, orgId: studyJob.orgId } // Return the jobInfo along with the orgId for validation in requireAbilityTo below
    })
    .requireAbilityTo('view', 'StudyJob')

    .handler(async ({ studyJob }) => {
        const encryptedFiles = studyJob.files.filter(
            (file) => isEncryptedLogType(file.fileType) || file.fileType === 'ENCRYPTED-RESULT',
        )

        const encryptedJobFiles = []
        for (const encryptedFile of encryptedFiles) {
            const blob = await fetchFileContents(encryptedFile.path)
            const reader = new ResultsReader(blob, new ArrayBuffer(0), '')
            const fileMetadata = await reader.listFiles()
            encryptedJobFiles.push({
                fileType: encryptedFile.fileType,
                sourceId: encryptedFile.id,
                blob,
                metadata: fileMetadata,
            })
        }

        return encryptedJobFiles
    })
