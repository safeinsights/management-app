import { db } from '@/database'
import { getOrgSlugFromActionContext, getUserIdFromActionContext } from './actions/wrappers'
import { getFirstOrganizationForUser } from './db/queries'
import { currentUser, clerkClient } from '@clerk/nextjs/server'

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

export async function findOrCreateOrgOrgship({
    userId,
    slug,
    isResearcher = true,
    isReviewer = true,
}: {
    userId: string
    slug: string
    isResearcher?: boolean
    isReviewer?: boolean
}) {
    let org = await db
        .selectFrom('orgUser')
        .innerJoin('org', (join) => join.on('org.slug', '=', slug).onRef('org.id', '=', 'orgUser.orgId'))
        .select(['org.id', 'org.slug', 'org.name'])
        .where('orgUser.userId', '=', userId)
        .executeTakeFirst()

    if (!org) {
        org = await db
            .selectFrom('org')
            .select(['org.id', 'org.slug', 'org.name'])
            .where('org.slug', '=', slug)
            .executeTakeFirst()
        if (!org) {
            throw new Error(`No organization found with slug ${slug}`)
        }
        await db
            .insertInto('orgUser')
            .values({
                userId,
                isAdmin: false,
                isReviewer,
                isResearcher,
                orgId: org.id,
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
            const orgships = await client.users.getOrganizationMembershipList({ userId: clerkUser.id })
            for (const orgship of orgships.data) {
                if (orgship.organization.slug) {
                    try {
                        org = await findOrCreateOrgOrgship({ userId, slug: orgship.organization.slug })
                    } catch {}
                }
            }
            if (!org) {
                throw new Error(`No organization found in Clerk for user`)
            }
        }
        return org
    }
    return await findOrCreateOrgOrgship({ userId, slug })
}
