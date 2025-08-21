'use server'

import { codeBuildRepositoryUrl, deleteFolderContents, signedUrlForStudyUpload } from '@/server/aws'
import { studyProposalApiSchema } from './study-proposal-form-schema'
import { db } from '@/database'
import { v7 as uuidv7 } from 'uuid'
import { pathForStudyDocuments, pathForStudyJobCode, pathForStudyJobCodeFile } from '@/lib/paths'
import { StudyDocumentType } from '@/lib/types'
import { onStudyCreated } from '@/server/events'
import { revalidatePath } from 'next/cache'
import { Action, z } from '@/server/actions/action'
import { getOrgIdFromSlug, getStudyOrgIdForStudyId } from '@/server/db/queries'

const upsertStudyActionArgsSchema = z.object({
    orgSlug: z.string(),
    studyId: z.string().optional(),
    studyInfo: studyProposalApiSchema,
    mainCodeFileName: z.string(),
    codeFileNames: z.array(z.string()),
})

export const upsertStudyAction = new Action('upsertStudyAction')
    .params(upsertStudyActionArgsSchema)
    .middleware(async ({ params: { orgSlug } }) => ({ orgId: (await getOrgIdFromSlug({ orgSlug })).id }))
    .requireAbilityTo('create', 'Study') // uses orgId from above
    .handler(async ({ params: { orgSlug, studyId: existingStudyId, studyInfo, mainCodeFileName, codeFileNames }, session, orgId }) => {
        const userId = session.user.id

        const studyId = existingStudyId ?? uuidv7()

        if (existingStudyId) {
            await db
                .updateTable('study')
                .set({
                    title: studyInfo.title,
                    piName: studyInfo.piName,
                    descriptionDocPath: studyInfo.descriptionDocPath,
                    irbDocPath: studyInfo.irbDocPath,
                    agreementDocPath: studyInfo.agreementDocPath,
                    status: 'PENDING-REVIEW',
                })
                .where('id', '=', studyId)
                .execute()
        } else {
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
        }

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

        onStudyCreated({ userId, studyId })

        const studyJobCodePath = pathForStudyJobCode({
            orgSlug,
            studyId,
            studyJobId: studyJob.id,
        })

        // s3 signed urls for client to upload
        const urlForMainCodeUpload = await signedUrlForStudyUpload(studyJobCodePath)
        const urlForAdditionalCodeUpload = await signedUrlForStudyUpload(studyJobCodePath)

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
            studyJobId: studyJob.id,
            urlForMainCodeUpload,
            urlForAdditionalCodeUpload,
            urlForAgreementUpload,
            urlForIrbUpload,
            urlForDescriptionUpload,
        }
    })

export const onDeleteStudyAction = new Action('onDeleteStudyAction')
    .params(
        z.object({
            orgSlug: z.string(),
            studyId: z.string(),
            studyJobId: z.string(),
        }),
    )
    .middleware(async ({ params: { studyId } }) => ({ orgId: (await getStudyOrgIdForStudyId(studyId)).orgId }))
    .requireAbilityTo('delete', 'Study') // will use orgId from above
    .handler(async ({ params: { orgSlug, studyId } }) => {
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
