'use server'

import { z } from 'zod'
import { clerkClient } from '@clerk/nextjs/server'
import { db } from '@/database'
import { ActionFailure, isClerkApiError } from '@/lib/errors'
import { findOrCreateOrgMembership } from '@/server/mutations' // DB only
import logger from '@/lib/logger'
import { findClerkOrganization } from '@/server/clerk'
import { onUserAcceptInvite } from '@/server/events'
import { anonAction, userAction, actionContext } from '@/server/actions/wrappers'

// Schema for onCreateAccountAction input
const CreateAccountSchema = z.object({
    inviteId: z.string(),
    email: z.string().email(), // Added email to ensure it matches invite
    form: z.object({
        firstName: z.string().nonempty(),
        lastName: z.string().nonempty(),
        password: z.string().min(8),
    }),
})

export const onCreateAccountAction = anonAction(async ({ inviteId, email, form }) => {
    const pendingUser = await db
        .selectFrom('pendingUser')
        .selectAll('pendingUser')
        .where('id', '=', inviteId)
        .where('email', '=', email) // Verify email matches the invite
        .where('claimedByUserId', 'is', null)
        .executeTakeFirst()

    if (!pendingUser) {
        throw new ActionFailure({ form: 'Invalid or already claimed invitation.' })
    }

    try {
        const client = await clerkClient()
        const existingClerkUsers = await client.users.getUserList({ emailAddress: [email] })
        if (existingClerkUsers.data.length > 0) {
            // This case should ideally be handled by InvitationHandler routing to existing user flow.
            // If an existing user somehow reaches here, it's an anomaly.
            throw new ActionFailure({
                email: 'An account with this email already exists. Please sign in to accept the invitation.',
            })
        }

        const clerkUser = await client.users.createUser({
            emailAddress: [email],
            password: form.password,
            firstName: form.firstName,
            lastName: form.lastName,
            // publicMetadata for roles will be set by onPendingUserLoginAction
        })
        return clerkUser.id // Return Clerk User ID
    } catch (error: unknown) {
        if (isClerkApiError(error)) {
            const clerkError = error.errors[0]
            logger.warn({ message: 'Clerk API error during user creation', clerkError, email })
            throw new ActionFailure({ form: clerkError.longMessage || clerkError.message })
        }
        logger.error({ message: 'Non-Clerk error during user creation', error, email })
        throw new ActionFailure({ form: 'Could not create account due to an unexpected error.' })
    }
}, CreateAccountSchema)

const ClaimInviteSchema = z.object({
    inviteId: z.string(),
})

export const claimInviteAction = userAction(async ({ inviteId }) => {
    const { user: authUser } = await actionContext()

    const siUserId = authUser.id!
    const { clerkId: clerkUserId } = await db
        .selectFrom('user')
        .select('clerkId')
        .where('id', '=', siUserId)
        .executeTakeFirstOrThrow()

    const pendingUser = await db
        .selectFrom('pendingUser')
        .innerJoin('org', 'org.id', 'pendingUser.orgId')
        .select([
            'pendingUser.id as pendingUserId',
            'pendingUser.orgId as localOrgDbId',
            'pendingUser.isResearcher',
            'pendingUser.isReviewer',
            'org.slug as orgSlug',
            'org.name as orgName',
        ])
        .where('pendingUser.id', '=', inviteId)
        .where('pendingUser.claimedByUserId', 'is', null)
        .executeTakeFirst()

    if (!pendingUser) {
        return { success: false, error: 'Invalid or already claimed invitation.' }
    }

    const clerkOrg = await findClerkOrganization({
        slug: pendingUser.orgSlug,
    })

    // 1. Update local DB
    const orgMembershipDetails = await findOrCreateOrgMembership({
        userId: siUserId,
        slug: pendingUser.orgSlug,
        isResearcher: pendingUser.isResearcher,
        isReviewer: pendingUser.isReviewer,
        isAdmin: false, // Default for invitees
    })

    try {
        const client = await clerkClient()
        // 2. Add to Clerk Organization (or update role if already member)
        try {
            await client.organizations.createOrganizationMembership({
                organizationId: clerkOrg.id, // This MUST be the Clerk Organization ID
                userId: clerkUserId,
                role: orgMembershipDetails.isAdmin ? 'org:admin' : 'org:member',
            })
        } catch (e: unknown) {
            if (isClerkApiError(e) && e.errors?.[0]?.code === 'duplicate_organization_membership') {
                logger.info(
                    `User ${clerkUserId} already member of Clerk org ${clerkOrg.id}. Role update might be needed separately if changed.`,
                )
            } else {
                throw e // Re-throw if it's another error
            }
        }

        // 3. Update Clerk User Public Metadata
        const clerkUserToUpdate = await client.users.getUser(clerkUserId)
        const existingMetadataOrgs = (clerkUserToUpdate.publicMetadata?.orgs as UserPublicMetadata['orgs']) || []
        const newOrgEntry = {
            slug: pendingUser.orgSlug,
            isAdmin: orgMembershipDetails.isAdmin,
            isResearcher: orgMembershipDetails.isResearcher,
            isReviewer: orgMembershipDetails.isReviewer,
        }
        const updatedOrgs = existingMetadataOrgs.filter((o) => o.slug !== pendingUser.orgSlug)
        updatedOrgs.push(newOrgEntry)

        await client.users.updateUser(clerkUserId, {
            publicMetadata: { ...clerkUserToUpdate.publicMetadata, userId: siUserId, orgs: updatedOrgs },
        })
    } catch (clerkError: unknown) {
        logger.error({
            message: 'Clerk update failed during invite claim',
            error: clerkError,
            clerkUserId,
            orgSlug: pendingUser.orgSlug,
        })
        throw new ActionFailure({
            message:
                'Failed to update your membership details with our authentication provider. Please contact support.',
        })
    }

    // 4. Mark invite as claimed in local DB
    await db
        .updateTable('pendingUser')
        .set({ claimedByUserId: siUserId })
        .where('id', '=', pendingUser.pendingUserId)
        .execute()

    // record audit & update Clerk metadata
    onUserAcceptInvite(siUserId)

    return {
        success: true,
        organizationName: pendingUser.orgName,
        orgSlug: pendingUser.orgSlug,
    }
}, ClaimInviteSchema)
