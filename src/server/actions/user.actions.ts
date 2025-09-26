'use server'

import { clerkClient } from '@clerk/nextjs/server'
import { syncCurrentClerkUser, updateClerkUserMetadata } from '../clerk'
import { getReviewerPublicKey } from '../db/queries'
import { onUserLogIn, onUserResetPW, onUserRoleUpdate } from '../events'
import { Action, z } from './action'
import { isEnclaveOrg } from '@/lib/types'

export const onUserSignInAction = new Action('onUserSignInAction').handler(async () => {
    const user = await syncCurrentClerkUser()
    const metadata = await updateClerkUserMetadata(user.id)
    onUserLogIn({ userId: user.id })

    if (Object.values(metadata.orgs).some((org) => isEnclaveOrg(org))) {
        const publicKey = await getReviewerPublicKey(user.id)
        if (!publicKey) {
            return { redirectToReviewerKey: true }
        }
    }
})

export const syncUserMetadataAction = new Action('syncUserMetadataAction').handler(async () => {
    const user = await syncCurrentClerkUser()
    const metadata = await updateClerkUserMetadata(user.id)
    return metadata
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
        return { orgUser, orgId: orgUser.orgId, id: userId }
    })
    .requireAbilityTo('update', 'User')
    .handler(async ({ params: { userId, isAdmin }, db, orgUser }) => {
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
        // Disable all MFA methods, delete phone numbers for reset to avoid verification issues
        await client.users.disableUserMFA(clerkId)

        const user = await client.users.getUser(clerkId)

        for (const phoneNumber of user.phoneNumbers) {
            await client.phoneNumbers.deletePhoneNumber(phoneNumber.id)
        }

        return { twoFactorEnabled: false }
    })
