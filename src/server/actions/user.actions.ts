'use server'

import { clerkClient } from '@clerk/nextjs/server'
import { sessionFromClerk } from '../clerk'
import { getUserPublicKey } from '../db/queries'
import { onUserLogIn, onUserResetPW, onUserRoleUpdate } from '../events'
import { Action, ActionFailure, z } from './action'

export const onUserSignInAction = new Action('onUserSignInAction').handler(async () => {
    const session = await sessionFromClerk({ forceUpdate: true })
    if (!session) {
        throw new Error('Failed to establish session')
    }
    onUserLogIn({ userId: session.user.id })
    const publicKey = await getUserPublicKey(session.user.id)
    if (!publicKey) {
        return { redirectToKeyGeneration: true }
    }
    return {}
})

export const syncUserMetadataAction = new Action('syncUserMetadataAction').handler(async () => {
    const session = await sessionFromClerk({ forceUpdate: true })
    if (!session) {
        throw new Error('Failed to establish session')
    }
    return {
        format: 'v3' as const,
        user: { id: session.user.id },
        teams: null,
        orgs: session.orgs,
    }
})

export const onUserResetPWAction = new Action('onUserResetPWAction')
    .middleware(async ({ session }) => {
        return { id: session?.user.id }
    })
    .requireAbilityTo('update', 'User')
    .handler(async ({ session }) => {
        onUserResetPW(session.user.id)
    })

export const updateUserRoleAction = new Action('updateUserRoleAction')
    .params(
        z.object({
            orgSlug: z.string(),
            userId: z.string(),
            isAdmin: z.boolean(),
        }),
    )
    .middleware(async ({ params: { userId, orgSlug }, db }) => {
        const orgUser = await db
            .selectFrom('orgUser')
            .select(['orgUser.id', 'orgId', 'isAdmin'])
            .where('orgUser.userId', '=', userId)
            .innerJoin('org', (join) => join.on('org.slug', '=', orgSlug).onRef('org.id', '=', 'orgUser.orgId'))
            .executeTakeFirstOrThrow()
        // No `id`: it would let the self-profile rule (`update User` on your own id) match (OTTER-720).
        return { orgUser, orgId: orgUser.orgId }
    })
    .requireAbilityTo('manageRole', 'User')
    .handler(async ({ params: { userId, isAdmin }, db, orgUser, session }) => {
        // An org admin holds `manageRole` for their own row too, so the ability check alone cannot
        // stop self-edits or an org being orphaned with zero admins.
        if (userId === session.user.id) {
            throw new ActionFailure({ permission_denied: 'cannot change your own role' })
        }

        await db.updateTable('orgUser').set({ isAdmin }).where('id', '=', orgUser.id).executeTakeFirstOrThrow()
        onUserRoleUpdate({
            userId,
            before: { ...orgUser },
            after: { isAdmin },
        })
    })

export const resetUserMFAAction = new Action('resetUserMFAAction')
    .requireAbilityTo('reset', 'MFA')
    .handler(async ({ session }) => {
        const clerkId = session!.user.clerkUserId

        const client = await clerkClient()
        await client.users.disableUserMFA(clerkId)

        const user = await client.users.getUser(clerkId)

        for (const phoneNumber of user.phoneNumbers) {
            await client.phoneNumbers.deletePhoneNumber(phoneNumber.id)
        }

        return { twoFactorEnabled: false }
    })
