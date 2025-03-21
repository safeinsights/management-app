'use server'

import { db } from '@/database'

export const findOrCreateSiUserId = async (clerkId: string, name: string) => {
    let user = await db
        .selectFrom('user')
        .select(['id', 'isResearcher'])
        .where('clerkId', '=', clerkId)
        .executeTakeFirst()

    if (!user) {
        user = await db
            .insertInto('user')
            .values({
                name,
                clerkId,
                isResearcher: true, // FIXME: we'll ned to update this once we have orgs membership
            })
            .returningAll()
            .executeTakeFirstOrThrow()
    }

    return user.id
}
