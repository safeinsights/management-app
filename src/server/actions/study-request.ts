'use server'
import * as path from 'node:path'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { DB } from '@/database/types'
import { throwNotFound } from '@/lib/errors'
import { pathForStudy, pathForStudyDocuments, pathForStudyJobCode, pathForStudyJobCodeFile } from '@/lib/paths'
import { StudyDocumentType } from '@/lib/types'
import { sanitizeFileName, sleep } from '@/lib/utils'
import { Action, ActionFailure, z } from '@/server/actions/action'
import {
    codeBuildRepositoryUrl,
    deleteFolderContents,
    createSignedUploadUrl,
    storeS3File,
    triggerScanForStudyJob,
} from '@/server/aws'
import { CODER_DISABLED, getConfigValue, SIMULATE_CODE_BUILD } from '@/server/config'
import { getInfoForStudyId, getInfoForStudyJobId, getOrgIdFromSlug } from '@/server/db/queries'
import { db as database } from '@/database'
import { deferred, onStudyCodeSubmitted, onStudyCreated } from '@/server/events'
import logger from '@/lib/logger'
import { Kysely } from 'kysely'
import { revalidatePath } from 'next/cache'
import { v7 as uuidv7 } from 'uuid'
import { draftStudyApiSchema } from '@/app/[orgSlug]/study/request/form-schemas'
import { DEFAULT_DRAFT_TITLE } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'

const simulateJobScan = deferred(async (studyJobId: string) => {
    await sleep({ 1: 'seconds' })
    await database.insertInto('jobStatusChange').values({ studyJobId, status: 'CODE-SCANNED' }).execute()
})

function triggerCodeScan(studyJobId: string, orgSlug: string, studyId: string) {
    if (SIMULATE_CODE_BUILD) {
        simulateJobScan(studyJobId)
    } else {
        triggerScanForStudyJob({ studyJobId, orgSlug, studyId }).catch((err) =>
            logger.error('Failed to trigger code scan', err, { studyJobId }),
        )
    }
}

async function addStudyJob(
    db: Kysely<DB>,
    userId: string,
    studyId: string,
    orgSlug: string,
    mainCodeFileName: string,
    codeFileNames: string[],
) {
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

    await db
        .insertInto('studyJobFile')
        .values({
            name: mainCodeFileName,
            path: pathForStudyJobCodeFile({ orgSlug, studyId, studyJobId: studyJob.id }, mainCodeFileName),
            studyJobId: studyJob.id,
            fileType: 'MAIN-CODE',
        })
        .executeTakeFirstOrThrow()

    for (const fileName of codeFileNames) {
        await db
            .insertInto('studyJobFile')
            .values({
                name: fileName,
                path: pathForStudyJobCodeFile({ orgSlug, studyId, studyJobId: studyJob.id }, fileName),
                studyJobId: studyJob.id,
                fileType: 'SUPPLEMENTAL-CODE',
            })
            .executeTakeFirstOrThrow()
    }

    const studyJobCodePath = pathForStudyJobCode({
        orgSlug,
        studyId,
        studyJobId: studyJob.id,
    })

    // s3 signed urls for client to upload
    const urlForCodeUpload = await createSignedUploadUrl(studyJobCodePath)

    return {
        studyJobId: studyJob.id,
        urlForCodeUpload,
    }
}

// Schema for creating a new draft
const onSaveDraftStudyActionArgsSchema = z.object({
    orgSlug: z.string(),
    submittingOrgSlug: z.string(),
    studyInfo: draftStudyApiSchema,
})

export const onSaveDraftStudyAction = new Action('onSaveDraftStudyAction', { performsMutations: true })
    .params(onSaveDraftStudyActionArgsSchema)
    .middleware(async ({ params: { orgSlug } }) => await getOrgIdFromSlug({ orgSlug }))
    .requireAbilityTo('create', 'Study')
    .handler(async ({ db, params: { orgSlug, studyInfo, submittingOrgSlug }, session, orgId }) => {
        const userId = session.user.id
        const submittingLab = await getOrgIdFromSlug({ orgSlug: submittingOrgSlug })
        const studyId = uuidv7()
        const containerLocation = await codeBuildRepositoryUrl({ studyId, orgSlug })

        await db
            .insertInto('study')
            .values({
                id: studyId,
                title: studyInfo.title || DEFAULT_DRAFT_TITLE,
                piName: studyInfo.piName || '',
                piUserId: studyInfo.piUserId || null,
                language: studyInfo.language,
                descriptionDocPath: studyInfo.descriptionDocPath || null,
                irbDocPath: studyInfo.irbDocPath || null,
                agreementDocPath: studyInfo.agreementDocPath || null,
                orgId,
                researcherId: userId,
                submittedByOrgId: submittingLab.orgId,
                containerLocation,
                status: 'DRAFT',
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        return {
            studyId,
            urlForAgreementUpload: await createSignedUploadUrl(
                pathForStudyDocuments({ studyId, orgSlug }, StudyDocumentType.AGREEMENT),
            ),
            urlForIrbUpload: await createSignedUploadUrl(
                pathForStudyDocuments({ studyId, orgSlug }, StudyDocumentType.IRB),
            ),
            urlForDescriptionUpload: await createSignedUploadUrl(
                pathForStudyDocuments({ studyId, orgSlug }, StudyDocumentType.DESCRIPTION),
            ),
        }
    })

// Schema for updating an existing draft
const onUpdateDraftStudyActionArgsSchema = onSaveDraftStudyActionArgsSchema
    .omit({ orgSlug: true, submittingOrgSlug: true })
    .extend({ studyId: z.string() })

export const onUpdateDraftStudyAction = new Action('onUpdateDraftStudyAction', { performsMutations: true })
    .params(onUpdateDraftStudyActionArgsSchema)
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('update', 'Study')
    .handler(async ({ db, params: { studyId, studyInfo }, session, orgSlug }) => {
        // Update study fields (only defined values)
        const updatable = [
            'title',
            'piName',
            'piUserId',
            'language',
            'descriptionDocPath',
            'irbDocPath',
            'agreementDocPath',
            'datasets',
            'researchQuestions',
            'projectSummary',
            'impact',
            'additionalNotes',
        ] as const
        const updateValues = Object.fromEntries(
            updatable.filter((k) => studyInfo[k] !== undefined).map((k) => [k, studyInfo[k]]),
        )

        if (Object.keys(updateValues).length > 0) {
            // Allow co-authoring within the submitting lab while the proposal is editable.
            // The CASL check above scopes the user to their orgs; here we filter to the
            // editable status set so submitted proposals are immutable.
            const userLabOrgIds = Object.values(session.orgs)
                .filter((org) => org.type === 'lab')
                .map((org) => org.id)

            await db
                .updateTable('study')
                .set(updateValues)
                .where('id', '=', studyId)
                .where('status', 'in', ['DRAFT', 'CHANGE-REQUESTED'])
                .where('submittedByOrgId', 'in', userLabOrgIds.length > 0 ? userLabOrgIds : [''])
                .execute()
        }

        return {
            studyId,
            urlForAgreementUpload: await createSignedUploadUrl(
                pathForStudyDocuments({ studyId, orgSlug }, StudyDocumentType.AGREEMENT),
            ),
            urlForIrbUpload: await createSignedUploadUrl(
                pathForStudyDocuments({ studyId, orgSlug }, StudyDocumentType.IRB),
            ),
            urlForDescriptionUpload: await createSignedUploadUrl(
                pathForStudyDocuments({ studyId, orgSlug }, StudyDocumentType.DESCRIPTION),
            ),
        }
    })

// Submit a draft study - converts DRAFT to PENDING-REVIEW and creates study job
const onSubmitDraftStudyActionArgsSchema = z.object({
    studyId: z.string(),
    mainCodeFileName: z.string(),
    codeFileNames: z.array(z.string()),
})

export const onSubmitDraftStudyAction = new Action('onSubmitDraftStudyAction', { performsMutations: true })
    .params(onSubmitDraftStudyActionArgsSchema)
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('update', 'Study')
    .handler(async ({ db, params: { studyId, mainCodeFileName, codeFileNames }, session, orgSlug }) => {
        const userId = session.user.id

        // Verify the study is in DRAFT status before submitting
        const study = await db
            .selectFrom('study')
            .select(['id', 'status'])
            .where('id', '=', studyId)
            .where('researcherId', '=', userId)
            .executeTakeFirst()

        if (!study) {
            throw new Error('Study not found or access denied')
        }

        if (study.status !== 'DRAFT' && study.status !== 'APPROVED') {
            throw new Error(`Cannot submit study: expected status DRAFT or APPROVED but got ${study.status}`)
        }

        // Create the study job for the code files
        const { studyJobId, urlForCodeUpload } = await addStudyJob(
            db,
            userId,
            studyId,
            orgSlug,
            mainCodeFileName,
            codeFileNames,
        )

        return {
            studyId,
            studyJobId,
            urlForCodeUpload,
        }
    })

// Finalize study submission after files are uploaded
// First-submit-wins: the conditional UPDATE ensures only one concurrent caller can
// transition the proposal from DRAFT/CHANGE-REQUESTED to PENDING-REVIEW. Subsequent
// callers see no rows updated and receive an ActionFailure that the client maps to
// the multi-user kick-out flow.
export const finalizeStudySubmissionAction = new Action('finalizeStudySubmissionAction', { performsMutations: true })
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('update', 'Study')
    .handler(async ({ db, params: { studyId }, session, orgSlug, status }) => {
        const userId = session.user.id

        // APPROVED is included to preserve the legacy code re-submission flow where an
        // already-approved proposal moves back to PENDING-REVIEW for a new code review.
        const claimed = await db
            .updateTable('study')
            .set({ status: 'PENDING-REVIEW', submittedAt: new Date() })
            .where('id', '=', studyId)
            .where('status', 'in', ['DRAFT', 'CHANGE-REQUESTED', 'APPROVED'])
            .returning(['id', 'submittedByOrgId'])
            .executeTakeFirst()

        if (!claimed) {
            throw new ActionFailure({ submission: 'Proposal has already been submitted' })
        }

        const submitter = await db
            .selectFrom('user')
            .select(['fullName'])
            .where('id', '=', userId)
            .executeTakeFirstOrThrow()

        const reviewerOrg = await db
            .selectFrom('study')
            .innerJoin('org', 'org.id', 'study.orgId')
            .select(['org.name as orgName'])
            .where('study.id', '=', studyId)
            .executeTakeFirstOrThrow()

        const latestJob = await db
            .selectFrom('studyJob')
            .select('id')
            .where('studyId', '=', studyId)
            .orderBy('createdAt', 'desc')
            .executeTakeFirst()

        if (latestJob) {
            await db
                .insertInto('jobStatusChange')
                .values({ studyJobId: latestJob.id, userId, status: 'CODE-SUBMITTED' })
                .execute()
            triggerCodeScan(latestJob.id, orgSlug, studyId)
        }

        if (status === 'APPROVED') {
            onStudyCodeSubmitted({ userId, studyId })
        } else {
            onStudyCreated({ userId, studyId })
        }

        revalidatePath(`/${orgSlug}/dashboard`)

        return {
            studyId,
            submitterFullName: submitter.fullName,
            orgName: reviewerOrg.orgName,
        }
    })

// Fetch draft/proposal approved study data for editing
export const getDraftStudyAction = new Action('getDraftStudyAction')
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ db, params: { studyId } }) => {
        const study = await db
            .selectFrom('study')
            .innerJoin('org', 'org.id', 'study.orgId')
            .innerJoin('user', 'user.id', 'study.researcherId')
            .select([
                'study.id',
                'study.title',
                'study.piName',
                'study.piUserId',
                'study.language',
                'study.descriptionDocPath',
                'study.irbDocPath',
                'study.agreementDocPath',
                'study.status',
                'study.researcherId',
                'study.orgId',
                'study.submittedByOrgId',
                'study.researchQuestions',
                'study.projectSummary',
                'study.impact',
                'study.additionalNotes',
                'study.datasets',
                'org.slug as orgSlug',
                'org.name as orgName',
                'user.fullName as researcherName',
            ])
            .where('study.id', '=', studyId)
            .where('study.status', 'in', ['DRAFT', 'CHANGE-REQUESTED', 'APPROVED'])
            .executeTakeFirstOrThrow(throwNotFound('Draft study'))
        return { study, orgId: study.orgId, submittedByOrgId: study.submittedByOrgId }
    })
    .requireAbilityTo('view', 'Study')
    .handler(async ({ db, study }) => {
        // Get code files if they exist
        const studyJob = await db
            .selectFrom('studyJob')
            .select('id')
            .where('studyId', '=', study.id)
            .orderBy('createdAt', 'desc')
            .executeTakeFirst()

        let codeFiles: { name: string; fileType: string }[] = []
        if (studyJob) {
            codeFiles = await db
                .selectFrom('studyJobFile')
                .select(['name', 'fileType'])
                .where('studyJobId', '=', studyJob.id)
                .execute()
        }

        return {
            ...study,
            mainCodeFileName: codeFiles.find((f) => f.fileType === 'MAIN-CODE')?.name,
            additionalCodeFileNames: codeFiles.filter((f) => f.fileType === 'SUPPLEMENTAL-CODE').map((f) => f.name),
        }
    })

export const onDeleteStudyJobAction = new Action('onDeleteStudyJobAction', { performsMutations: true })
    .params(z.object({ studyJobId: z.string() }))
    .middleware(async ({ params: { studyJobId } }) => await getInfoForStudyJobId(studyJobId))
    .requireAbilityTo('delete', 'StudyJob') // will use orgId from above
    .handler(async ({ db, studyId, orgSlug, params: { studyJobId } }) => {
        await db.deleteFrom('jobStatusChange').where('studyJobId', '=', studyJobId).execute()
        await db.deleteFrom('studyJobFile').where('studyJobId', '=', studyJobId).execute()
        await db.deleteFrom('studyJob').where('id', '=', studyJobId).execute()

        try {
            await deleteFolderContents(pathForStudyJobCode({ orgSlug, studyJobId, studyId }))
        } catch (err) {
            logger.error(`Failed to delete S3 files for job ${studyJobId}: ${err}`)
        }
    })

export const onDeleteStudyAction = new Action('onDeleteStudyAction', { performsMutations: true })
    .params(z.object({ studyId: z.string() }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('delete', 'Study') // will use orgId from above
    .handler(async ({ db, orgSlug, params: { studyId } }) => {
        const jobs = await db.selectFrom('studyJob').select('id').where('studyId', '=', studyId).execute()
        if (jobs.length > 0) {
            const jobIds = jobs.map((job) => job.id)
            await db.deleteFrom('jobStatusChange').where('studyJobId', 'in', jobIds).execute()
            await db.deleteFrom('studyJobFile').where('studyJobId', 'in', jobIds).execute()
            await db.deleteFrom('studyJob').where('id', 'in', jobIds).execute()
        }
        await db.deleteFrom('study').where('id', '=', studyId).execute()
        // Clean up the files from s3
        await deleteFolderContents(pathForStudy({ orgSlug, studyId }))
    })

const addJobToStudyActionArgsSchema = z.object({
    studyId: z.string(),
    mainCodeFileName: z.string(),
    codeFileNames: z.array(z.string()),
})

export const addJobToStudyAction = new Action('addJobToStudyAction', { performsMutations: true })
    .params(addJobToStudyActionArgsSchema)
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('create', 'StudyJob')
    .handler(async ({ orgSlug, params: { studyId, mainCodeFileName, codeFileNames }, session, db }) => {
        const userId = session.user.id

        const { studyJobId, urlForCodeUpload } = await addStudyJob(
            db,
            userId,
            studyId,
            orgSlug,
            mainCodeFileName,
            codeFileNames,
        )

        await db.insertInto('jobStatusChange').values({ studyJobId, userId, status: 'CODE-SUBMITTED' }).execute()

        await db
            .updateTable('study')
            .set({ status: 'PENDING-REVIEW', submittedAt: new Date() })
            .where('id', '=', studyId)
            .execute()

        onStudyCodeSubmitted({ userId, studyId })

        revalidatePath('/dashboard')
        revalidatePath(`/${orgSlug}/study/${studyId}/review`)

        triggerCodeScan(studyJobId, orgSlug, studyId)

        return { studyJobId, urlForCodeUpload }
    })

export const submitStudyCodeAction = new Action('submitStudyCodeAction', { performsMutations: true })
    .params(z.object({ studyId: z.string(), mainFileName: z.string(), fileNames: z.array(z.string()) }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('create', 'StudyJob')
    .handler(async ({ orgSlug, params: { studyId, mainFileName, fileNames }, session, db, status }) => {
        if (fileNames.length === 0) {
            throw new Error('No files provided')
        }

        if (!fileNames.includes(mainFileName)) {
            throw new Error('Main file not in file list')
        }

        const userId = session.user.id
        const sanitizedMainFileName = sanitizeFileName(mainFileName)
        const additionalFileNames = fileNames.filter((f) => f !== mainFileName).map((f) => sanitizeFileName(f))

        const { studyJobId } = await addStudyJob(
            db,
            userId,
            studyId,
            orgSlug,
            sanitizedMainFileName,
            additionalFileNames,
        )

        let coderFilesPath = await getConfigValue('CODER_FILES')
        if (!CODER_DISABLED) {
            coderFilesPath += `/${studyId}`
        }

        for (const fileName of fileNames) {
            const sanitizedName = sanitizeFileName(fileName)
            const filePath = path.join(coderFilesPath, sanitizedName)
            const fileStream = createReadStream(filePath)
            const webStream = Readable.toWeb(fileStream) as ReadableStream
            const s3Path = pathForStudyJobCodeFile({ orgSlug, studyId, studyJobId }, sanitizedName)
            await storeS3File({ orgSlug, studyId }, webStream, s3Path)
        }

        await db.insertInto('jobStatusChange').values({ studyJobId, userId, status: 'CODE-SUBMITTED' }).execute()

        await db
            .updateTable('study')
            .set({ status: 'PENDING-REVIEW', submittedAt: new Date() })
            .where('id', '=', studyId)
            .execute()

        if (status === 'APPROVED') {
            onStudyCodeSubmitted({ userId, studyId })
        } else {
            onStudyCreated({ userId, studyId })
        }

        revalidatePath('/dashboard')
        revalidatePath(`/${orgSlug}/study/${studyId}/review`)

        triggerCodeScan(studyJobId, orgSlug, studyId)

        return { studyJobId }
    })
