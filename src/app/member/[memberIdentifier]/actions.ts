'use server'

import { DEV_ENV } from '@/lib/util'
import { ECR, generateRepositoryPath } from '@/server/ecr'
import { FormValues, schema } from './schema'
import { db } from '@/database'
import { uuidToB64 } from '@/server/uuid'

export const onSubmitAction = async (memberId: string, study: FormValues) => {
    schema.parse(study) // throws when malformed

    const member = await db
        .selectFrom('member')
        .select('identifier')
        .where('id', '=', memberId)
        .executeTakeFirstOrThrow()

    const repoPath = generateRepositoryPath(member.identifier, study.title)

    let repoUrl = ''
    if (DEV_ENV) {
        repoUrl = '905418271997.dkr.ecr.us-east-1.amazonaws.com/${repoPath}:latest'
    } else {
        const ecr = new ECR()
        repoUrl = await ecr.createAnalysisRepository(repoPath, {
            title: study.title,
        })
    }

    const response = await db
        .insertInto('study')
        .values({
            title: study.title,
            memberId,
            researcherId: '00000000-0000-0000-0000-000000000000', // FIXME: get researcherId from clerk session
            containerLocation: repoUrl,
        })
        .returning('id')
        .execute()

    if (!response.length) throw new Error('Failed to insert study')

    return uuidToB64(response[0].id)
}
