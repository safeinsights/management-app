'use server'

import { USING_CONTAINER_REGISTRY } from '@/server/config'
import { createAnalysisRepository, generateRepositoryPath, getAWSInfo } from '@/server/aws'
import { StudyProposalFormValues, studyProposalSchema } from './study-proposal-schema'
import { db } from '@/database'
import { v7 as uuidv7 } from 'uuid'
import { strToAscii } from '@/lib/string'
import { siUser } from '@/server/queries'
import { storeStudyCodeFile, storeStudyDocumentFile } from '@/server/storage'
import { onStudyJobCreateAction } from '@/server/actions/study-job-actions'
import { CodeReviewManifest } from '@/lib/code-manifest'

export const onCreateStudyAction = async (memberId: string, studyInfo: StudyProposalFormValues) => {
    studyProposalSchema.parse(studyInfo) // throws when malformed

    const user = await siUser()

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
            researcherId: user.id,
            containerLocation: repoUrl,
            status: 'PENDING-REVIEW',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    const studyJobId = await onStudyJobCreateAction(studyId)

    const manifest = new CodeReviewManifest(studyJobId, 'r')

    for (const codeFile of studyInfo.codeFiles) {
        manifest.files.push(codeFile)
        await storeStudyCodeFile(
            {
                memberIdentifier: member.identifier,
                studyId,
                studyJobId,
            },
            codeFile,
        )
    }

    const manifestFile = new File([manifest.asJSON], 'manifest.json', { type: 'application/json' })

    await storeStudyCodeFile(
        {
            memberIdentifier: member.identifier,
            studyId,
            studyJobId,
        },
        manifestFile,
    )

    await db
        .insertInto('jobStatusChange')
        .values({
            userId: user.id,
            status: 'CODE-SUBMITTED',
            studyJobId,
        })
        .execute()

    return {
        studyId: studyId,
        studyJobId: studyJobId,
    }
}
