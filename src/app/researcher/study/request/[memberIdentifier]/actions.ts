'use server'

import { USING_CONTAINER_REGISTRY } from '@/server/config'
import { createAnalysisRepository, generateRepositoryPath, getAWSInfo } from '@/server/aws'
import { StudyProposalFormValues, studyProposalSchema } from './studyProposalSchema'
import { db } from '@/database'
import { uuidToB64 } from '@/lib/uuid'
import { v7 as uuidv7 } from 'uuid'
import { onStudyJobCreateAction } from '@/app/researcher/studies/actions'
import { strToAscii } from '@/lib/string'
import { siUser } from '@/server/queries'

export const onCreateStudyAction = async (memberId: string, study: StudyProposalFormValues) => {
    studyProposalSchema.parse(study) // throws when malformed

    const user = await siUser()

    const member = await db
        .selectFrom('member')
        .select('identifier')
        .where('id', '=', memberId)
        .executeTakeFirstOrThrow()

    const studyId = uuidv7()

    const repoPath = generateRepositoryPath({ memberIdentifier: member.identifier, studyId, studyTitle: study.title })
    const descriptionFile = study.description ? study.description.name : ''
    const irbDocumentFile = study.irbDocument ? study.irbDocument.name : ''
    // TODO: Add agreement document

    let repoUrl = ''

    if (USING_CONTAINER_REGISTRY) {
        repoUrl = await createAnalysisRepository(repoPath, {
            title: strToAscii(study.title),
            studyId,
        })
    } else {
        const { accountId, region } = await getAWSInfo()
        repoUrl = `${accountId}.dkr.ecr.${region}.amazonaws.com/${repoPath}`
    }
    await db
        .insertInto('study')
        .values({
            id: studyId,
            title: study.title,
            piName: study.piName,
            description: descriptionFile,
            irbProtocols: irbDocumentFile,
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
        studyId: uuidToB64(studyId),
        studyJobId: uuidToB64(studyJobId),
    }
}
