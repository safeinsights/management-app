'use server'

import { db } from '@/database'
import { clerkClient, currentUser } from '@clerk/nextjs/server'
import { anonAction, getUserIdFromActionContext, orgAdminAction, userAction, z } from './wrappers'
import { onUserLogIn, onUserResetPW, onUserRoleUpdate } from '../events'
import { findOrCreateOrgMembership } from '../mutations'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import logger from '@/lib/logger'
import { getReviewerPublicKey } from '../db/queries'

export const onUserSignInAction = anonAction(async () => {
    const clerkUser = await currentUser()

    if (!clerkUser) throw new Error('User not authenticated')

    const userAttrs = {
        firstName: clerkUser.firstName ?? '',
        lastName: clerkUser.lastName ?? '',
        email: clerkUser.primaryEmailAddress?.emailAddress ?? '',
    }

    let user = await db.selectFrom('user').select('id').where('clerkId', '=', clerkUser.id).executeTakeFirst()
    if (user) {
        await db.updateTable('user').set(userAttrs).where('id', '=', user.id).executeTakeFirstOrThrow()
    } else {
        user = await db
            .insertInto('user')
            .values({
                clerkId: clerkUser.id,
                ...userAttrs,
            })
            .returningAll()
            .executeTakeFirstOrThrow()
    }

    const clerk = await clerkClient()
    const memberships = await clerk.users.getOrganizationMembershipList({ userId: clerkUser.id })

    logger.info(
        `signin user ${userAttrs.email} ${clerkUser.id} ${user.id} ${memberships.data.map((o) => o.organization.slug).join(',')}`,
    )

    for (const org of memberships.data) {
        if (!org.organization.slug || org.organization.slug == CLERK_ADMIN_ORG_SLUG) continue

        const md = clerkUser.publicMetadata?.orgs?.find((o) => o.slug == org.organization.slug)
        // Resolve role flags: values in publicMetadata override Clerk membership role;
        // if metadata is absent, fall back to Clerk's built-in `role === 'admin'`.
        const isAdmin = md?.isAdmin ?? (org.role === 'admin')
        const isResearcher = md?.isResearcher ?? false
        const isReviewer = md?.isReviewer ?? false
        try {
            await findOrCreateOrgMembership({
                userId: user.id,
                slug: org.organization.slug,
                isResearcher,
                isAdmin,
                isReviewer,
            })
        } catch (e) {
            logger.error(`Failed to find or create org membership for ${org.organization.slug}`, e)
        }
    }
    onUserLogIn({ userId: user.id })

    // Check if the user is a reviewer and needs to generate a public key
    const isReviewer = memberships.data.some(
        (org) =>
            org.organization.slug !== CLERK_ADMIN_ORG_SLUG &&
            clerkUser.publicMetadata?.orgs?.find((o) => o.slug === org.organization.slug)?.isReviewer,
    )

    if (isReviewer) {
        const publicKey = await getReviewerPublicKey(user.id)
        if (publicKey === null) {
            return { redirectToReviewerKey: true }
        }
    }
})

export const onUserResetPWAction = userAction(async () => {
    const userId = await getUserIdFromActionContext()
    onUserResetPW(userId)
})

export const updateUserRoleAction = orgAdminAction(
    async ({ orgSlug, userId, ...update }) => {
        const { id, ...before } = await db
            .selectFrom('orgUser')
            .select(['orgUser.id', 'isResearcher', 'isReviewer', 'isAdmin'])
            .innerJoin('org', 'org.id', 'orgUser.orgId')
            .where('org.slug', '=', orgSlug as string)
            .where('orgUser.userId', '=', userId)
            .executeTakeFirstOrThrow()

        await db.updateTable('orgUser').set(update).where('id', '=', id).executeTakeFirstOrThrow()

        onUserRoleUpdate({ userId, before, after: update })
    },
    z.object({
        orgSlug: z.string(),
        userId: z.string(),
        isAdmin: z.boolean(),
        isResearcher: z.boolean(),
        isReviewer: z.boolean(),
    }),
)
