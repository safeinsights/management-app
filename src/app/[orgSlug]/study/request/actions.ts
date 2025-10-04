'use server'
import { DB } from '@/database/types'
import { pathForStudy, pathForStudyDocuments, pathForStudyJobCode, pathForStudyJobCodeFile } from '@/lib/paths'
import { StudyDocumentType } from '@/lib/types'
import { Action, z } from '@/server/actions/action'
import { codeBuildRepositoryUrl, deleteFolderContents, signedUrlForStudyUpload } from '@/server/aws'
import { getInfoForStudyId, getInfoForStudyJobId, getOrgIdFromSlug } from '@/server/db/queries'
import { onStudyCreated } from '@/server/events'
import { Kysely } from 'kysely'
import { revalidatePath } from 'next/cache'
import { v7 as uuidv7 } from 'uuid'
import { studyProposalApiSchema } from './study-proposal-form-schema'

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
            language: 'R', // TODO: make this dynamic based on user selection
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
