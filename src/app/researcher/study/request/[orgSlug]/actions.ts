'use server'
import { codeBuildRepositoryUrl, deleteFolderContents, signedUrlForStudyUpload } from '@/server/aws'
import { studyProposalApiSchema } from './study-proposal-form-schema'
import { v7 as uuidv7 } from 'uuid'
import { pathForStudyDocuments, pathForStudyJobCode, pathForStudyJobCodeFile } from '@/lib/paths'
import { StudyDocumentType } from '@/lib/types'
import { onStudyCreated } from '@/server/events'
import { revalidatePath } from 'next/cache'
import { Action, z } from '@/server/actions/action'
import { getOrgIdFromSlug, getStudyOrgIdForStudyId } from '@/server/db/queries'
import { DB } from '@/database/types'
import { Kysely } from 'kysely'

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
    const urlForMainCodeUpload = await signedUrlForStudyUpload(studyJobCodePath)
    const urlForAdditionalCodeUpload = await signedUrlForStudyUpload(studyJobCodePath)

    return {
        studyJobId: studyJob.id,
        urlForMainCodeUpload,
        urlForAdditionalCodeUpload,
    }
}

const onCreateStudyActionArgsSchema = z.object({
    orgSlug: z.string(),
    studyInfo: studyProposalApiSchema,
    mainCodeFileName: z.string(),
    codeFileNames: z.array(z.string()),
})

export const onCreateStudyAction = new Action('onCreateStudyAction', { performsMutations: true })
    .params(onCreateStudyActionArgsSchema)
    .middleware(async ({ params: { orgSlug } }) => ({ orgId: (await getOrgIdFromSlug({ orgSlug })).id }))
    .requireAbilityTo('create', 'Study') // uses orgId from above
    .handler(async ({ params: { orgSlug, studyInfo, mainCodeFileName, codeFileNames }, session, orgId, db }) => {
        const userId = session.user.id

        const studyId = uuidv7()

        const containerLocation = await codeBuildRepositoryUrl({ studyId, orgSlug: orgSlug })

        await db
            .insertInto('study')
            .values({
                id: studyId,
                title: studyInfo.title,
                piName: studyInfo.piName,
                descriptionDocPath: studyInfo.descriptionDocPath,
                irbDocPath: studyInfo.irbDocPath,
                agreementDocPath: studyInfo.agreementDocPath,
                orgId: orgId,
                researcherId: userId,
                containerLocation,
                status: 'PENDING-REVIEW',
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        const { studyJobId, urlForMainCodeUpload, urlForAdditionalCodeUpload } = await addStudyJob(
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

        revalidatePath('/researcher/dashboard')

        return {
            studyId: studyId,
            studyJobId,
            urlForMainCodeUpload,
            urlForAdditionalCodeUpload,
            urlForAgreementUpload,
            urlForIrbUpload,
            urlForDescriptionUpload,
        }
    })

export const onDeleteStudyAction = new Action('onDeleteStudyAction', { performsMutations: true })
    .params(
        z.object({
            orgSlug: z.string(),
            studyId: z.string(),
            studyJobId: z.string(),
        }),
    )
    .middleware(async ({ params: { studyId } }) => ({ orgId: (await getStudyOrgIdForStudyId(studyId)).orgId }))
    .requireAbilityTo('delete', 'Study') // will use orgId from above
    .handler(async ({ db, params: { orgSlug, studyId } }) => {
        const jobs = await db.selectFrom('studyJob').select('id').where('studyId', '=', studyId).execute()
        const jobIds = jobs.map((job) => job.id)

        if (jobIds.length > 0) {
            await db.deleteFrom('jobStatusChange').where('studyJobId', 'in', jobIds).execute()
            await db.deleteFrom('studyJobFile').where('studyJobId', 'in', jobIds).execute()
            await db.deleteFrom('studyJob').where('id', 'in', jobIds).execute()
        }

        await db.deleteFrom('study').where('id', '=', studyId).execute()

        // Clean up the files from s3
        await deleteFolderContents(`studies/${orgSlug}/${studyId}`)
    })

const addJobToStudyActionArgsSchema = z.object({
    studyId: z.string(),
    orgSlug: z.string(),
    mainCodeFileName: z.string(),
    codeFileNames: z.array(z.string()),
})

export const addJobToStudyAction = new Action('addJobToStudyAction', { performsMutations: true })
    .params(addJobToStudyActionArgsSchema)
    .middleware(async ({ params: { studyId } }) => {
        const { orgId } = await getStudyOrgIdForStudyId(studyId)
        return { orgId }
    })
    .requireAbilityTo('update', 'Study')
    .handler(async ({ params: { studyId, orgSlug, mainCodeFileName, codeFileNames }, session, db }) => {
        const userId = session.user.id

        const { studyJobId, urlForMainCodeUpload, urlForAdditionalCodeUpload } = await addStudyJob(
            db,
            userId,
            studyId,
            orgSlug,
            mainCodeFileName,
            codeFileNames,
        )

        revalidatePath('/researcher/dashboard')
        revalidatePath(`/researcher/study/${studyId}/review`)

        return {
            studyId,
            studyJobId,
            urlForMainCodeUpload,
            urlForAdditionalCodeUpload,
        }
    })
