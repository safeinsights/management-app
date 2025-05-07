import { db } from '@/database'
import { getOrgInfoFromActionContext, getUserIdFromActionContext } from './actions/wrappers'
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

export async function findOrCreateOrgMembership({
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
        ])
        .where('orgUser.userId', '=', userId)
        .executeTakeFirst()

    if (orgInfo) {
        if (orgInfo.isResearcher != isResearcher || orgInfo.isReviewer != isReviewer) {
            db.updateTable('orgUser')
                .set({ isResearcher, isReviewer })
                .where('id', '=', orgInfo.orgUserId)
                .executeTakeFirstOrThrow()
        }
        return { ...orgInfo, isReviewer, isResearcher }
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
                isAdmin: false,
                isReviewer,
                isResearcher,
                orgId: org.id,
            })
            .executeTakeFirstOrThrow()
        return { ...org, isReviewer, isResearcher }
    }
}

export async function ensureUserIsMemberOfOrg() {
    const userId = await getUserIdFromActionContext()
    const info = await getOrgInfoFromActionContext(false)
    if (!info.slug) {
        let org = await getFirstOrganizationForUser(userId)
        if (!org) {
            const clerkUser = await currentUser()
            if (!clerkUser) throw new Error(`user is not signed into clerk`)
            const client = await clerkClient()
            const orgships = await client.users.getOrganizationMembershipList({ userId: clerkUser.id })
            for (const orgship of orgships.data) {
                if (orgship.organization.slug) {
                    try {
                        org = await findOrCreateOrgMembership({ userId, slug: orgship.organization.slug })
                    } catch {}
                }
            }
            if (!org) {
                throw new Error(`No organization found in Clerk for user`)
            }
        }
        return org
    }
    return await findOrCreateOrgMembership({ userId, slug: info.slug })
}
