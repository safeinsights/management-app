'use server'

import { db } from '@/database'
import { clerkClient, currentUser } from '@clerk/nextjs/server'
import { anonAction, getUserIdFromActionContext, orgAdminAction, userAction, z } from './wrappers'
import { onUserLogIn, onUserResetPW, onUserRoleUpdate } from '../events'
import { ActionFailure } from '@/lib/errors'
import { findOrCreateOrgMembership } from '../mutations'

export const onUserSignInAction = anonAction(async () => {
    const clerkUser = await currentUser()

    if (!clerkUser) throw new Error('User not authenticated')

    const userAttrs = {
        firstName: clerkUser.firstName ?? '',
        lastName: clerkUser.lastName ?? '',
        email: clerkUser.primaryEmailAddress?.emailAddress ?? '',
    }

    const blankAttrs = Object.values(userAttrs).filter((v) => !v)
    if (blankAttrs.length) {
        throw new ActionFailure({ user: `is missing required attributes ${blankAttrs.join(',')}` })
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
    for (const org of memberships.data) {
        if (!org.organization.slug) continue

        const md = clerkUser.publicMetadata?.orgs?.find((o) => o.slug == org.organization.slug)
        findOrCreateOrgMembership({
            userId: user.id,
            slug: org.organization.slug,
            isResearcher: md?.isResearcher,
            isAdmin: md?.isAdmin,
            isReviewer: md?.isReviewer,
        })
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
