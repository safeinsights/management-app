import { db } from '@/database'
import { getOrgSlugFromActionContext, getUserIdFromActionContext } from './actions/wrappers'
import { getFirstOrganizationForUser } from './db/queries'
import { currentUser, clerkClient } from '@clerk/nextjs/server'

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
        let org = await getFirstOrganizationForUser(userId)
        if (!org) {
            const clerkUser = await currentUser()
            if (!clerkUser) throw new Error(`user is not signed into clerk`)
            const client = await clerkClient()
            const memberships = await client.users.getOrganizationMembershipList({ userId: clerkUser.id })
            for (const membership of memberships.data) {
                if (membership.organization.slug) {
                    try {
                        org = await findOrCreateOrgMembership({ userId, slug: membership.organization.slug })
                    } catch {}
                }
            }
            if (!org) {
                throw new Error(`No organization found in Clerk for user`)
            }
        }
        return org
    }
    return await findOrCreateOrgMembership({ userId, slug })
}
