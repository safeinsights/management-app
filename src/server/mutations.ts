import { db } from '@/database'
import { throwNotFound } from '@/lib/errors'

type SiUserOptionalAttrs = {
    firstName?: string | null
    lastName?: string | null
    email?: string | null
}

export const findOrCreateSiUserId = async (clerkId: string, attrs: SiUserOptionalAttrs = {}) => {
    let user = await db.selectFrom('user').select(['id']).where('clerkId', '=', clerkId).executeTakeFirst()

    if (!user) {
        user = await db
            .insertInto('user')
            .values({
                clerkId,
                ...attrs,
                firstName: attrs.firstName ?? 'Unknown', // unlike clerk, we require users to have some sort of name for showing in reports
            })
            .returningAll()
            .executeTakeFirstOrThrow()
    }

    return user.id
}

export async function findOrCreateOrgMembership({
    userId,
    slug,
    isAdmin = false,
}: {
    userId: string
    slug: string
    isAdmin?: boolean
}) {
    const orgInfo = await db
        .selectFrom('orgUser')
        .innerJoin('org', (join) => join.on('org.slug', '=', slug).onRef('org.id', '=', 'orgUser.orgId'))
        .select(['org.id', 'org.slug', 'org.name', 'org.type', 'orgUser.id as orgUserId', 'orgUser.isAdmin'])
        .where('orgUser.userId', '=', userId)
        .executeTakeFirst()

    if (orgInfo) {
        if (orgInfo.isAdmin != isAdmin) {
            await db
                .updateTable('orgUser')
                .set({ isAdmin })
                .where('id', '=', orgInfo.orgUserId)
                .executeTakeFirstOrThrow()
        }
        return { ...orgInfo, isAdmin }
    } else {
        const org = await db
            .selectFrom('org')
            .select(['org.id', 'org.slug', 'org.name', 'org.type'])
            .where('org.slug', '=', slug)
            .executeTakeFirstOrThrow(throwNotFound(`organization with slug ${slug}`))

        await db
            .insertInto('orgUser')
            .values({
                userId,
                isAdmin,
                orgId: org.id,
            })
            .executeTakeFirstOrThrow()
        return { ...org, isAdmin }
    }
}
