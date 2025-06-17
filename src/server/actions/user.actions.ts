'use server'

import { db } from '@/database'
import { clerkClient, currentUser } from '@clerk/nextjs/server'
import { anonAction, getUserIdFromActionContext, orgAdminAction, userAction, z } from './wrappers'
import { onUserLogIn, onUserResetPW, onUserRoleUpdate } from '../events'
import { findOrCreateOrgMembership } from '../mutations'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import logger from '@/lib/logger'

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
        try {
            await findOrCreateOrgMembership({
                userId: user.id,
                slug: org.organization.slug,
                isResearcher: md?.isResearcher,
                isAdmin: md?.isAdmin,
                isReviewer: md?.isReviewer,
            })
        } catch (e) {
            if (e instanceof Error && e.message.includes('No organization found with slug')) {
                logger.warn(
                    `During login, user ${user.id} was found to be a member of clerk org ${org.organization.slug}, which was not found in the SI database. Skipping membership creation.`,
                    e,
                )
            } else {
                logger.error(
                    `An unexpected error occurred while creating or updating membership for user ${user.id} in org ${org.organization.slug}.`,
                    e,
                )
            }
        }
    }
    onUserLogIn({ userId: user.id })
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

// Action to let the client know if an email already exists in SI
export const userExistsAction = anonAction(async (email: string) => {
    const row = await db.selectFrom('user').select('id').where('email', '=', email).executeTakeFirst()
    return Boolean(row)
}, z.string())

// Action to check for a pending invite for a user who needs to set up MFA.
// This is used as a fail-safe in the sign-in flow to prevent users from getting
// stuck if they sign up via invite but then sign in from a different browser
// before completing MFA setup.
export const checkPendingInviteForMfaUserAction = anonAction(async (email: string) => {
    const pendingInvite = await db
        .selectFrom('pendingUser')
        .select('id')
        .where('email', '=', email)
        .where('claimedByUserId', 'is', null)
        .executeTakeFirst()

    return !!pendingInvite
}, z.string())

// Verifies that a pending, unclaimed invite exists for a given invite ID and email.
// This ensures the user claiming the invite is the one it was intended for.
export const verifyPendingInviteAction = anonAction(
    async ({ inviteId, email }) => {
        const pendingInvite = await db
            .selectFrom('pendingUser')
            .select('id')
            .where('id', '=', inviteId)
            .where('email', '=', email)
            .where('claimedByUserId', 'is', null)
            .executeTakeFirst()

        return !!pendingInvite
    },
    z.object({
        inviteId: z.string(),
        email: z.string().email(),
    }),
)
