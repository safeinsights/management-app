'use server'

import { slugify, DEV_ENV } from '@/lib/util'
import { ECR } from '@/lib/ecr'
import { FormValues, schema } from './schema'
import { db } from '@/database'
import { uuidToB64 } from '@/server/uuid'

export const onSubmitAction = async (memberId: string, data: FormValues) => {
    schema.parse(data) // throws when malformed

    const member = await db
        .selectFrom('member')
        .select('identifier')
        .where('id', '=', memberId)
        .executeTakeFirstOrThrow()
    const slug = slugify(data.title)

    let repoUrl = 'not-created-in-dev-mode'
    if (!DEV_ENV) {
        const ecr = new ECR()
        repoUrl = await ecr.createAnalysisRepository(`${member.identifier}/${slug}`, {
            title: data.title,
        })
    }

    const response = await db
        .insertInto('study')
        .values({
            title: data.title,
            memberId,
            researcherId: '00000000-0000-0000-0000-000000000000', // FIXME: get researcherId from clerk session
            containerLocation: repoUrl,
        })
        .returning('id')
        .execute()

    if (!response.length) throw new Error('Failed to insert study')

    return uuidToB64(response[0].id)
}
