import { db } from '@/database'
import { getOrgSlugFromActionContext, getUserIdFromActionContext } from './actions/wrappers'
import { getFirstOrganizationForUser } from './db/queries'

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

export async function findOrCreateOrgMembership({
    userId,
    slug,
    isReviewer = true,
}: {
    userId: string
    slug: string
    isReviewer?: boolean
}) {
    let org = await db
        .selectFrom('memberUser')
        .innerJoin('member', (join) => join.on('member.slug', '=', slug).onRef('member.id', '=', 'memberUser.memberId'))
        .select(['member.id', 'member.slug', 'member.name'])
        .where('memberUser.userId', '=', userId)
        .executeTakeFirst()

    if (!org) {
        org = await db
            .selectFrom('member')
            .select(['member.id', 'member.slug', 'member.name'])
            .where('member.slug', '=', slug)
            .executeTakeFirst()
        if (!org) {
            throw new Error(`No organization found with slug ${slug}`)
        }
        await db
            .insertInto('memberUser')
            .values({
                userId,
                isAdmin: false,
                isReviewer,
                memberId: org.id,
            })
            .executeTakeFirstOrThrow()
    }
    return org
}

export async function ensureUserIsMemberOfOrg() {
    const userId = await getUserIdFromActionContext()
    const slug = await getOrgSlugFromActionContext(false)
    if (!slug) {
        const org = await getFirstOrganizationForUser(userId)
        if (!org) {
            throw new Error(`No organization found for user`)
        }
        return org
    }
    return await findOrCreateOrgMembership({ userId, slug })
}
