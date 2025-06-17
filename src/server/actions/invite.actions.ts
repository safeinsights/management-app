/**
 * This file defines the server-side logic for handling user invitations, which follows two distinct paths
 * depending on whether the user is new or already has an account.
 *
 * 1. New User Flow:
 *    - A new user follows a multi-step process starting with the `onCreateAccountAction`.
 *    - `onCreateAccountAction`: Triggered from the sign-up form on the invitation page. It creates the user in
 *      both Clerk and the local database, and immediately associates them with the organization from the invite.
 *      This includes creating the database `orgUser` record and the Clerk organization membership.
 *    - After account creation and MFA setup, the `claimInviteAction` is called as the final step.
 *
 * 2. Existing User Flow:
 *    - An existing user who clicks an invitation link is prompted to sign in.
 *    - Once authenticated, the `claimInviteAction` is called directly.
 *
 * `claimInviteAction`: This action serves as the final step for both new and existing users.
 *    - It validates that the authenticated user's email matches the invitation.
 *    - For existing users, it performs the crucial step of associating them with the new organization,
 *      creating the necessary database and Clerk records.
 *    - For all users, it marks the invitation as claimed in the database and triggers follow-up events like
 *      auditing and updating Clerk user metadata.
 */
'use server'

import { z } from 'zod'
import { clerkClient } from '@clerk/nextjs/server'
import { db } from '@/database'
import { ActionFailure, isClerkApiError } from '@/lib/errors'
import { findOrCreateOrgMembership } from '@/server/mutations' // DB only
import logger from '@/lib/logger'
import { updateClerkUserMetadata } from '@/server/clerk'
import { onUserAcceptInvite } from '@/server/events'
import { anonAction, userAction, actionContext } from '@/server/actions/wrappers'
import { findOrCreateSiUserId } from '@/server/db/mutations'

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
        .innerJoin('org', 'org.id', 'pendingUser.orgId')
        .selectAll('pendingUser')
        .select(['org.slug as orgSlug'])
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

        // 1. Create Clerk user
        const clerkUser = await client.users.createUser({
            emailAddress: [email],
            password: form.password,
            firstName: form.firstName,
            lastName: form.lastName,
        })

        // 2. Create SI user
        const siUserId = await findOrCreateSiUserId(clerkUser.id, {
            email: email,
            firstName: form.firstName,
            lastName: form.lastName,
        })

        // 3. Associate user with organization
        const clerkOrg = await client.organizations.getOrganization({ slug: pendingUser.orgSlug })

        await findOrCreateOrgMembership({
            userId: siUserId,
            slug: pendingUser.orgSlug,
            isResearcher: pendingUser.isResearcher,
            isReviewer: pendingUser.isReviewer,
            isAdmin: false, // Default for invitees
        })

        await client.organizations.createOrganizationMembership({
            organizationId: clerkOrg.id,
            userId: clerkUser.id,
            role: 'org:member',
        })

        await updateClerkUserMetadata(siUserId)

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
            'pendingUser.email',
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

    if (pendingUser.email !== authUser.primaryEmailAddress?.emailAddress) {
        return { success: false, error: 'This invitation is for a different user. Please log out and try again.' }
    }

    // The user and organization membership should already be created by onCreateAccountAction
    // This action primarily marks the invite as claimed.
    try {
        // Ensure Clerk user metadata is up-to-date after claiming the invite
        await updateClerkUserMetadata(siUserId)
    } catch (clerkError: unknown) {
        logger.error({
            message: 'Clerk metadata update failed during invite claim',
            error: clerkError,
            clerkUserId,
            orgSlug: pendingUser.orgSlug,
        })
        throw new ActionFailure({
            message: 'Failed to update your user information. Please contact support.',
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
