'use server'

import { db } from '@/database'

type SiUserOptionalAttrs = {
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    isResearcher?: boolean
}
export const findOrCreateSiUserId = async (clerkId: string, attrs: SiUserOptionalAttrs = {}) => {
    let user = await db
        .selectFrom('user')
        .select(['id', 'isResearcher'])
        .where('clerkId', '=', clerkId)
        .executeTakeFirst()

    if (!user) {
        user = await db
            .insertInto('user')
            .values({
                clerkId,
                isResearcher: attrs.isResearcher ?? false,
                ...attrs,
                firstName: attrs.firstName ?? 'Unknown', // unlike clerk, we require users to have some sort of name for showing in reports
            })
            .returningAll()
            .executeTakeFirstOrThrow()
    }

    return user.id
}
