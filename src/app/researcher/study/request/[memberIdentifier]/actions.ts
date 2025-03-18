'use server'

import { USING_CONTAINER_REGISTRY } from '@/server/config'
import { createAnalysisRepository, generateRepositoryPath, getAWSInfo } from '@/server/aws'
import { StudyProposalFormValues, studyProposalSchema } from './study-proposal-schema'
import { db } from '@/database'
import { v7 as uuidv7 } from 'uuid'
import { onStudyJobCreateAction } from '@/app/researcher/studies/actions'
import { strToAscii } from '@/lib/string'
import { siUser } from '@/server/queries'
import { storeStudyDocumentFile } from '@/server/storage'

export const onCreateStudyAction = async (memberId: string, studyInfo: StudyProposalFormValues) => {
    studyProposalSchema.parse(studyInfo) // throws when malformed

    const user = await siUser()

    const member = await db
        .selectFrom('member')
        .select('identifier')
        .where('id', '=', memberId)
        .executeTakeFirstOrThrow()

    const studyId = uuidv7()

    // storeStudyDocumentFile({
    //     studyId,
    //     file: study.irbDocument,
    // }, file)

    const repoPath = generateRepositoryPath({
        memberIdentifier: member.identifier,
        studyId,
        studyTitle: studyInfo.title,
    })

    //    const irbDocumentFile = studyInfo.irbDocument ? study.irbDocument.name : ''
    // TODO: Add agreement document

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
            // irbProtocols: irbDocumentFile,
            //TODO: add study lead
            // TODO:add agreement document
            memberId,
            researcherId: user.id,
            containerLocation: repoUrl,
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    const studyJobId = await onStudyJobCreateAction(studyId)

    return {
        studyId: studyId,
        studyJobId: studyJobId,
    }
}
