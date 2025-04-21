'use server'

import {
    codeBuildRepositoryUrl,
    deleteFolderContents,
    signedUrlForCodeUpload,
    signedUrlForStudyFileUpload,
} from '@/server/aws'
import { studyProposalApiSchema } from './study-proposal-form-schema'
import { db } from '@/database'
import { v7 as uuidv7 } from 'uuid'
import { getUserIdFromActionContext, researcherAction, z } from '@/server/actions/wrappers'
import { getMemberFromSlugAction } from '@/server/actions/member.actions'
import { pathForStudyDocuments } from '@/lib/paths'
import { StudyDocumentType } from '@/lib/types'

const onCreateStudyActionArgsSchema = z.object({
    memberSlug: z.string(),
    studyInfo: studyProposalApiSchema,
})

export const onCreateStudyAction = researcherAction(async ({ memberSlug, studyInfo }) => {
    const userId = await getUserIdFromActionContext()

    const member = await getMemberFromSlugAction(memberSlug)

    const studyId = uuidv7()

    const containerLocation = await codeBuildRepositoryUrl({ studyId, memberSlug: member.slug })
    await db
        .insertInto('study')
        .values({
            id: studyId,
            title: studyInfo.title,
            piName: studyInfo.piName,
            descriptionDocPath: studyInfo.descriptionDocPath,
            irbDocPath: studyInfo.irbDocPath,
            agreementDocPath: studyInfo.agreementDocPath,
            memberId: member.id,
            researcherId: userId,
            containerLocation,
            status: 'PENDING-REVIEW',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

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

    // s3 signed urls for client to upload
    const urlForCodeUpload = await signedUrlForCodeUpload({
        memberSlug,
        studyId,
        studyJobId: studyJob.id,
    })

    const urlForAgreementUpload = await signedUrlForStudyFileUpload(
        pathForStudyDocuments({ studyId, memberSlug }, StudyDocumentType.AGREEMENT),
    )

    const urlForIrbUpload = await signedUrlForStudyFileUpload(
        pathForStudyDocuments({ studyId, memberSlug }, StudyDocumentType.IRB),
    )

    const urlForDescriptionUpload = await signedUrlForStudyFileUpload(
        pathForStudyDocuments({ studyId, memberSlug }, StudyDocumentType.DESCRIPTION),
    )

    return {
        studyId: studyId,
        studyJobId: studyJob.id,
        urlForCodeUpload,
        urlForAgreementUpload,
        urlForIrbUpload,
        urlForDescriptionUpload,
    }
}, onCreateStudyActionArgsSchema)

export const onDeleteStudyAction = researcherAction(
    async ({ memberSlug, studyId, studyJobId }) => {
        await db.deleteFrom('jobStatusChange').where('studyJobId', '=', studyJobId).execute()
        await db.deleteFrom('studyJob').where('id', '=', studyJobId).execute()
        await db.deleteFrom('study').where('id', '=', studyId).execute()

        // Clean up the files from s3
        await deleteFolderContents(`studies/${memberSlug}/${studyId}`)
    },
    z.object({
        memberSlug: z.string(),
        studyId: z.string(),
        studyJobId: z.string(),
    }),
)
