'use server'

import { codeBuildRepositoryUrl } from '@/server/aws'
import { studyProposalSchema } from './study-proposal-schema'
import { db } from '@/database'
import { v7 as uuidv7 } from 'uuid'

import { storeStudyCodeFile, storeStudyDocumentFile } from '@/server/storage'
import { CodeReviewManifest } from '@/lib/code-manifest'
import { z, getUserIdFromActionContext, researcherAction } from '@/server/actions/wrappers'
import { StudyDocumentType } from '@/lib/types'

const onCreateStudyActionArgsSchema = z.object({
    memberId: z.string(),
    studyInfo: studyProposalSchema,
})

export const onCreateStudyAction = researcherAction(async ({ memberId, studyInfo }) => {
    const userId = getUserIdFromActionContext()

    const member = await db
        .selectFrom('member')
        .select('identifier')
        .where('id', '=', memberId)
        .executeTakeFirstOrThrow()

    const studyId = uuidv7()

    let irbDocPath = ''
    if (studyInfo.irbDocument) {
        await storeStudyDocumentFile(
            { studyId, memberIdentifier: member.identifier },
            StudyDocumentType.IRB,
            studyInfo.irbDocument,
        )
        irbDocPath = studyInfo.irbDocument.name
    }

    let descriptionDocPath = ''
    if (studyInfo.descriptionDocument) {
        await storeStudyDocumentFile(
            { studyId, memberIdentifier: member.identifier },
            StudyDocumentType.DESCRIPTION,
            studyInfo.descriptionDocument,
        )
        descriptionDocPath = studyInfo.descriptionDocument.name
    }

    const containerLocation = await codeBuildRepositoryUrl({ studyId, memberIdentifier: member.identifier })

    await db
        .insertInto('study')
        .values({
            id: studyId,
            title: studyInfo.title,
            piName: studyInfo.piName,
            descriptionDocPath,
            irbDocPath,
            // TODO: add study lead
            // TODO: add agreement document
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
                memberIdentifier: member.identifier,
                studyId,
                studyJobId: studyJob.id,
            },
            codeFile,
        )
    }

    const manifestFile = new File([manifest.asJSON], 'manifest.json', { type: 'application/json' })

    await storeStudyCodeFile(
        {
            memberIdentifier: member.identifier,
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
