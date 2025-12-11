'use server'
import * as path from 'node:path'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { DB } from '@/database/types'
import { pathForStudy, pathForStudyDocuments, pathForStudyJobCode, pathForStudyJobCodeFile } from '@/lib/paths'
import { StudyDocumentType } from '@/lib/types'
import { Action, z } from '@/server/actions/action'
import { codeBuildRepositoryUrl, deleteFolderContents, signedUrlForStudyUpload, storeS3File } from '@/server/aws'
import { DEV_ENV, getConfigValue } from '@/server/config'
import { getInfoForStudyId, getInfoForStudyJobId, getOrgIdFromSlug } from '@/server/db/queries'
import { onStudyCreated } from '@/server/events'
import { Kysely } from 'kysely'
import { revalidatePath } from 'next/cache'
import { v7 as uuidv7 } from 'uuid'
import { draftStudyApiSchema, studyProposalApiSchema } from './study-proposal-form-schema'

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
        .insertInto('jobStatusChange')
        .values({
            userId: userId,
            status: 'CODE-SUBMITTED',
            studyJobId: studyJob.id,
        })
        .execute()

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
    const urlForCodeUpload = await signedUrlForStudyUpload(studyJobCodePath)

    return {
        studyJobId: studyJob.id,
        urlForCodeUpload,
    }
}

const onCreateStudyActionArgsSchema = z.object({
    orgSlug: z.string(),
    studyInfo: studyProposalApiSchema,
    mainCodeFileName: z.string(),
    codeFileNames: z.array(z.string()),
    submittingOrgSlug: z.string(),
})

export const onCreateStudyAction = new Action('onCreateStudyAction', { performsMutations: true })
    .params(onCreateStudyActionArgsSchema)
    .middleware(async ({ params: { orgSlug } }) => await getOrgIdFromSlug({ orgSlug }))
    .requireAbilityTo('create', 'Study') // uses orgId from above
    .handler(
        async ({
            db,
            params: { orgSlug, studyInfo, mainCodeFileName, codeFileNames, submittingOrgSlug },
            session,
            orgId,
        }) => {
            const userId = session.user.id
            const submittingLab = await getOrgIdFromSlug({ orgSlug: submittingOrgSlug })

            const studyId = uuidv7()

            const containerLocation = await codeBuildRepositoryUrl({ studyId, orgSlug })

            await db
                .insertInto('study')
                .values({
                    id: studyId,
                    title: studyInfo.title,
                    piName: studyInfo.piName,
                    language: studyInfo.language,
                    descriptionDocPath: studyInfo.descriptionDocPath,
                    irbDocPath: studyInfo.irbDocPath,
                    agreementDocPath: studyInfo.agreementDocPath,
                    orgId,
                    researcherId: userId,
                    submittedByOrgId: submittingLab.orgId,
                    containerLocation,
                    status: 'PENDING-REVIEW',
                })
                .returning('id')
                .executeTakeFirstOrThrow()

            const { studyJobId, urlForCodeUpload } = await addStudyJob(
                db,
                userId,
                studyId,
                orgSlug,
                mainCodeFileName,
                codeFileNames,
            )

            onStudyCreated({ userId, studyId })

            const urlForAgreementUpload = await signedUrlForStudyUpload(
                pathForStudyDocuments({ studyId, orgSlug }, StudyDocumentType.AGREEMENT),
            )

            const urlForIrbUpload = await signedUrlForStudyUpload(
                pathForStudyDocuments({ studyId, orgSlug }, StudyDocumentType.IRB),
            )

            const urlForDescriptionUpload = await signedUrlForStudyUpload(
                pathForStudyDocuments({ studyId, orgSlug }, StudyDocumentType.DESCRIPTION),
            )

            revalidatePath(`/${orgSlug}/dashboard`)

            return {
                studyId: studyId,
                studyJobId,
                urlForCodeUpload,
                urlForAgreementUpload,
                urlForIrbUpload,
                urlForDescriptionUpload,
            }
        },
    )

// Schema for creating a new draft (partial data allowed)
const onSaveDraftStudyActionArgsSchema = onCreateStudyActionArgsSchema.partial().extend({
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
                title: studyInfo.title || 'Untitled Draft',
                piName: studyInfo.piName || '',
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
            urlForAgreementUpload: await signedUrlForStudyUpload(
                pathForStudyDocuments({ studyId, orgSlug }, StudyDocumentType.AGREEMENT),
            ),
            urlForIrbUpload: await signedUrlForStudyUpload(
                pathForStudyDocuments({ studyId, orgSlug }, StudyDocumentType.IRB),
            ),
            urlForDescriptionUpload: await signedUrlForStudyUpload(
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
        const userId = session.user.id

        // Update study fields (only defined values)
        const updatable = [
            'title',
            'piName',
            'language',
            'descriptionDocPath',
            'irbDocPath',
            'agreementDocPath',
        ] as const
        const updateValues = Object.fromEntries(
            updatable.filter((k) => studyInfo[k] !== undefined).map((k) => [k, studyInfo[k]]),
        )

        if (Object.keys(updateValues).length > 0) {
            await db
                .updateTable('study')
                .set(updateValues)
                .where('id', '=', studyId)
                .where('status', '=', 'DRAFT')
                .where('researcherId', '=', userId)
                .execute()
        }

        return {
            studyId,
            urlForAgreementUpload: await signedUrlForStudyUpload(
                pathForStudyDocuments({ studyId, orgSlug }, StudyDocumentType.AGREEMENT),
            ),
            urlForIrbUpload: await signedUrlForStudyUpload(
                pathForStudyDocuments({ studyId, orgSlug }, StudyDocumentType.IRB),
            ),
            urlForDescriptionUpload: await signedUrlForStudyUpload(
                pathForStudyDocuments({ studyId, orgSlug }, StudyDocumentType.DESCRIPTION),
            ),
        }
    })

// Fetch draft study data for editing
// Note: We don't use requireAbilityTo here because drafts should be accessible
// to the researcher who created them regardless of current org context.
export const getDraftStudyAction = new Action('getDraftStudyAction')
    .params(z.object({ studyId: z.string() }))
    .handler(async ({ db, params: { studyId }, session }) => {
        if (!session) {
            throw new Error('Authentication required')
        }

        const study = await db
            .selectFrom('study')
            .innerJoin('org', 'org.id', 'study.orgId')
            .select([
                'study.id',
                'study.title',
                'study.piName',
                'study.language',
                'study.descriptionDocPath',
                'study.irbDocPath',
                'study.agreementDocPath',
                'study.status',
                'study.researcherId',
                'org.slug as orgSlug',
            ])
            .where('study.id', '=', studyId)
            .where('study.status', '=', 'DRAFT')
            .where('study.researcherId', '=', session.user.id)
            .executeTakeFirst()

        if (!study) {
            throw new Error('Draft study not found or access denied')
        }

        // Get code files if they exist
        const studyJob = await db
            .selectFrom('studyJob')
            .select('id')
            .where('studyId', '=', studyId)
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

        await deleteFolderContents(pathForStudyJobCode({ orgSlug, studyJobId, studyId }))
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

        await db.updateTable('study').set({ status: 'PENDING-REVIEW' }).where('id', '=', studyId).execute()

        revalidatePath('/dashboard')
        revalidatePath(`/${orgSlug}/study/${studyId}/review`)

        return { studyJobId, urlForCodeUpload }
    })

export const submitStudyFromIDEAction = new Action('submitStudyFromIDEAction', { performsMutations: true })
    .params(z.object({ studyId: z.string(), mainFileName: z.string(), fileNames: z.array(z.string()) }))
    .middleware(async ({ params: { studyId } }) => await getInfoForStudyId(studyId))
    .requireAbilityTo('create', 'StudyJob')
    .handler(async ({ orgSlug, params: { studyId, mainFileName, fileNames }, session, db }) => {
        if (fileNames.length === 0) {
            throw new Error('No files provided')
        }

        if (!fileNames.includes(mainFileName)) {
            throw new Error('Main file not in file list')
        }

        const userId = session.user.id
        const additionalFileNames = fileNames.filter((f) => f !== mainFileName)

        const { studyJobId } = await addStudyJob(db, userId, studyId, orgSlug, mainFileName, additionalFileNames)

        let coderFilesPath = await getConfigValue('CODER_FILES')
        if (!DEV_ENV) {
            coderFilesPath += `/${studyId}`
        }

        for (const fileName of fileNames) {
            const filePath = path.join(coderFilesPath, fileName)
            const fileStream = createReadStream(filePath)
            const webStream = Readable.toWeb(fileStream) as ReadableStream
            const s3Path = pathForStudyJobCodeFile({ orgSlug, studyId, studyJobId }, fileName)
            await storeS3File({ orgSlug, studyId }, webStream, s3Path)
        }

        await db.updateTable('study').set({ status: 'PENDING-REVIEW' }).where('id', '=', studyId).execute()

        revalidatePath('/dashboard')
        revalidatePath(`/${orgSlug}/study/${studyId}/review`)

        return { studyJobId }
    })
