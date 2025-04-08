'use server'

import { codeBuildRepositoryUrl } from '@/server/aws'
import { studyProposalSchema } from './study-proposal-schema'
import { db } from '@/database'
import { v7 as uuidv7 } from 'uuid'
import { storeStudyCodeFile, storeStudyDocumentFile } from '@/server/storage'
import { CodeReviewManifest } from '@/lib/code-manifest'
import { getUserIdFromActionContext, researcherAction, z } from '@/server/actions/wrappers'
import { StudyDocumentType } from '@/lib/types'

const onCreateStudyActionArgsSchema = z.object({
    memberId: z.string(),
    studyInfo: studyProposalSchema,
})

export const onCreateStudyAction = researcherAction(async ({ memberId, studyInfo }) => {
    const userId = await getUserIdFromActionContext()

    const member = await db.selectFrom('member').select('slug').where('id', '=', memberId).executeTakeFirstOrThrow()

    const studyId = uuidv7()

    if (studyInfo.irbDocument) {
        await storeStudyDocumentFile({ studyId, memberSlug: member.slug }, StudyDocumentType.IRB, studyInfo.irbDocument)
    }

    if (studyInfo.descriptionDocument) {
        await storeStudyDocumentFile(
            { studyId, memberSlug: member.slug },
            StudyDocumentType.DESCRIPTION,
            studyInfo.descriptionDocument,
        )
    }

    if (studyInfo.agreementDocument) {
        await storeStudyDocumentFile(
            { studyId, memberSlug: member.slug },
            StudyDocumentType.AGREEMENT,
            studyInfo.agreementDocument,
        )
    }

    const containerLocation = await codeBuildRepositoryUrl({ studyId, memberSlug: member.slug })
    await db
        .insertInto('study')
        .values({
            id: studyId,
            title: studyInfo.title,
            piName: studyInfo.piName,
            descriptionDocPath: studyInfo.descriptionDocument?.name,
            irbDocPath: studyInfo.irbDocument?.name,
            agreementDocPath: studyInfo.agreementDocument?.name,
            // TODO: add study lead
            memberId,
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

    const manifest = new CodeReviewManifest(studyJob.id, 'r')

    for (const codeFile of studyInfo.codeFiles) {
        manifest.files.push(codeFile)
        await storeStudyCodeFile(
            {
                memberSlug: member.slug,
                studyId,
                studyJobId: studyJob.id,
            },
            codeFile,
        )
    }

    const manifestFile = new File([manifest.asJSON], 'manifest.json', { type: 'application/json' })

    await storeStudyCodeFile(
        {
            memberSlug: member.slug,
            studyId,
            studyJobId: studyJob.id,
        },
        manifestFile,
    )

    await db
        .insertInto('jobStatusChange')
        .values({
            userId: userId,
            status: 'CODE-SUBMITTED',
            studyJobId: studyJob.id,
        })
        .execute()

    return {
        studyId: studyId,
        studyJobId: studyJob.id,
    }
}, onCreateStudyActionArgsSchema)
