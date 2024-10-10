'use server'

import { DEV_ENV } from '@/server/config'
import { ECR, generateRepositoryPath, getAWSInfo } from '@/server/aws'
import { FormValues, schema } from './schema'
import { db } from '@/database'
import { uuidToB64, uuidv7 } from '@/server/uuid'

export const onCreateStudyAction = async (memberId: string, study: FormValues) => {
    schema.parse(study) // throws when malformed

    const member = await db
        .selectFrom('member')
        .select('identifier')
        .where('id', '=', memberId)
        .executeTakeFirstOrThrow()

    const studyId = uuidv7()
    const repoPath = generateRepositoryPath({ memberIdentifier: member.identifier, studyId, studyTitle: study.title })

    let repoUrl = ''
    if (DEV_ENV) {
        const { accountId, region } = await getAWSInfo()
        repoUrl = `${accountId}.dkr.ecr.${region}.amazonaws.com/${repoPath}`
    } else {
        const ecr = new ECR()
        repoUrl = await ecr.createAnalysisRepository(repoPath, {
            title: study.title,
        })
    }
    const results = await db.transaction().execute(async (trx) => {
        await trx
            .insertInto('study')
            .values({
                id: studyId,
                title: study.title,
                description: study.description,
                piName: study.piName,
                memberId,
                researcherId: '00000000-0000-0000-0000-000000000000', // FIXME: get researcherId from clerk session
                containerLocation: repoUrl,
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        const studyRunId = await trx
            .insertInto('studyRun')
            .values({
                studyId: studyId,
                status: 'created',
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        return {
            studyId: uuidToB64(studyId),
            studyRunId: uuidToB64(studyRunId.id),
        }
    })

    return results
}
