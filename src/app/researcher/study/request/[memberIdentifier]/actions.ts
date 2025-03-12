'use server'

import { USING_CONTAINER_REGISTRY } from '@/server/config'
import { createAnalysisRepository, generateRepositoryPath, getAWSInfo } from '@/server/aws'
import { FormValues, schema } from './schema'
import { db } from '@/database'
import { v7 as uuidv7 } from 'uuid'
import { onStudyJobCreateAction } from '@/app/researcher/studies/actions'
import { strToAscii } from '@/lib/string'
import { siUser } from '@/server/queries'

export const onCreateStudyAction = async (memberId: string, study: FormValues) => {
    schema.parse(study) // throws when malformed

    const user = await siUser()

    const member = await db
        .selectFrom('member')
        .select('identifier')
        .where('id', '=', memberId)
        .executeTakeFirstOrThrow()

    const studyId = uuidv7()

    const repoPath = generateRepositoryPath({ memberIdentifier: member.identifier, studyId, studyTitle: study.title })

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
            description: study.description,
            piName: study.piName,
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
