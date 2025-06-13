import { db } from '@/database'

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
    isResearcher = true,
    isReviewer = true,
    isAdmin = false,
}: {
    userId: string
    slug: string
    isResearcher?: boolean
    isReviewer?: boolean
    isAdmin?: boolean
}) {
    const orgInfo = await db
        .selectFrom('orgUser')
        .innerJoin('org', (join) => join.on('org.slug', '=', slug).onRef('org.id', '=', 'orgUser.orgId'))
        .select([
            'org.id',
            'org.slug',
            'org.name',
            'orgUser.id as orgUserId',
            'orgUser.isResearcher',
            'orgUser.isReviewer',
            'orgUser.isAdmin',
        ])
        .where('orgUser.userId', '=', userId)
        .executeTakeFirst()

    if (orgInfo) {
        if (orgInfo.isResearcher != isResearcher || orgInfo.isReviewer != isReviewer || orgInfo.isAdmin != isAdmin) {
            db.updateTable('orgUser')
                .set({ isResearcher, isReviewer, isAdmin })
                .where('id', '=', orgInfo.orgUserId)
                .executeTakeFirstOrThrow()
        }
        return { ...orgInfo, isReviewer, isResearcher, isAdmin }
    } else {
        const org = await db
            .selectFrom('org')
            .select(['org.id', 'org.slug', 'org.name'])
            .where('org.slug', '=', slug)
            .executeTakeFirstOrThrow(() => new Error(`No organization found with slug ${slug}`))

        await db
            .insertInto('orgUser')
            .values({
                userId,
                isReviewer,
                isResearcher,
                isAdmin,
                orgId: org.id,
            })
            .executeTakeFirstOrThrow()
        return { ...org, isReviewer, isResearcher, isAdmin }
    }
}
