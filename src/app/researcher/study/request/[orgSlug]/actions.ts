'use server'

import { AccessDeniedError } from '@/lib/errors'
import { codeBuildRepositoryUrl, deleteFolderContents, signedUrlForStudyUpload } from '@/server/aws'
import { studyProposalApiSchema } from './study-proposal-form-schema'
import { db } from '@/database'
import { v7 as uuidv7 } from 'uuid'
import { getUserIdFromActionContext, researcherAction, z } from '@/server/actions/wrappers'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'
import { pathForStudyDocuments, pathForStudyJobCode } from '@/lib/paths'
import { StudyDocumentType } from '@/lib/types'
import { sendStudyProposalEmails } from '@/server/mailgun'
import { revalidatePath } from 'next/cache'

const onCreateStudyActionArgsSchema = z.object({
    orgSlug: z.string(),
    studyInfo: studyProposalApiSchema,
})

export const onCreateStudyAction = researcherAction(async ({ orgSlug, studyInfo }) => {
    const userId = await getUserIdFromActionContext()

    const org = await getOrgFromSlugAction(orgSlug)

    // Verify researcher is allowed to submit studies to this organization
    const memberUser = await db
        .selectFrom('memberUser')
        .select('id')
        .where('userId', '=', userId)
        .where('memberId', '=', member.id)
        .executeTakeFirst()

    if (!memberUser) {
        throw new AccessDeniedError('You are not a member of this organization')
    }

    const studyId = uuidv7()

    const containerLocation = await codeBuildRepositoryUrl({ studyId, orgSlug: org.slug })

    await db
        .insertInto('study')
        .values({
            id: studyId,
            title: studyInfo.title,
            piName: studyInfo.piName,
            descriptionDocPath: studyInfo.descriptionDocPath,
            irbDocPath: studyInfo.irbDocPath,
            agreementDocPath: studyInfo.agreementDocPath,
            orgId: org.id,
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

    await sendStudyProposalEmails(studyId)

    const studyJobCodePath = pathForStudyJobCode({
        orgSlug,
        studyId,
        studyJobId: studyJob.id,
    })

    // s3 signed urls for client to upload
    const urlForCodeUpload = await signedUrlForStudyUpload(studyJobCodePath)

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
        urlForCodeUpload,
        urlForAgreementUpload,
        urlForIrbUpload,
        urlForDescriptionUpload,
    }
}, onCreateStudyActionArgsSchema)

export const onDeleteStudyAction = researcherAction(
    async ({ orgSlug, studyId, studyJobId }) => {
        await db.deleteFrom('jobStatusChange').where('studyJobId', '=', studyJobId).execute()
        await db.deleteFrom('studyJob').where('id', '=', studyJobId).execute()
        await db.deleteFrom('study').where('id', '=', studyId).execute()

        // Clean up the files from s3
        await deleteFolderContents(`studies/${orgSlug}/${studyId}`)
    },
    z.object({
        orgSlug: z.string(),
        studyId: z.string(),
        studyJobId: z.string(),
    }),
)
