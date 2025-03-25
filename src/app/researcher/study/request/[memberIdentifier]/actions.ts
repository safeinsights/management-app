'use server'

import { USING_CONTAINER_REGISTRY } from '@/server/config'
import { createAnalysisRepository, generateRepositoryPath, getAWSInfo } from '@/server/aws'
import { studyProposalSchema } from './study-proposal-schema'
import { db } from '@/database'
import { v7 as uuidv7 } from 'uuid'
import { strToAscii } from '@/lib/string'

import { storeStudyCodeFile, storeStudyDocumentFile } from '@/server/storage'
import { CodeReviewManifest } from '@/lib/code-manifest'
import { z, getUserIdFromActionContext, researcherAction } from '@/server/actions/wrappers'

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

    const repoPath = generateRepositoryPath({
        memberIdentifier: member.identifier,
        studyId,
        studyTitle: studyInfo.title,
    })

    let repoUrl = ''

    if (USING_CONTAINER_REGISTRY) {
        repoUrl = await createAnalysisRepository(repoPath, {
            title: strToAscii(studyInfo.title),
            studyId,
        })
    } else {
        const { accountId, region } = await getAWSInfo()
        repoUrl = `${accountId}.dkr.ecr.${region}.amazonaws.com/${repoPath}`
    }
    let irbDocPath = ''
    if (studyInfo.irbDocument) {
        irbDocPath = await storeStudyDocumentFile(
            { studyId, memberIdentifier: member.identifier },
            studyInfo.irbDocument,
        )
    }

    let descriptionDocPath = ''
    if (studyInfo.descriptionDocument) {
        descriptionDocPath = await storeStudyDocumentFile(
            { studyId, memberIdentifier: member.identifier },
            studyInfo.descriptionDocument,
        )
    }

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
            containerLocation: repoUrl,
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
