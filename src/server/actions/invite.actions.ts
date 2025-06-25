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
import { findOrCreateOrgMembership } from '@/server/mutations'
import logger from '@/lib/logger'
import { updateClerkUserMetadata } from '@/server/clerk'
import { onUserAcceptInvite } from '@/server/events'
import { anonAction, userAction, actionContext } from '@/server/actions/wrappers'
import { findOrCreateSiUserId } from '@/server/db/mutations'

/**
 * Associates a user with an organization in both the local DB and Clerk.
 */
async function _associateUserWithOrg(
    siUserId: string,
    clerkUserId: string,
    pendingUser: { orgSlug: string; isResearcher: boolean; isReviewer: boolean },
) {
    // Create/update the database membership record.
    await findOrCreateOrgMembership({
        userId: siUserId,
        slug: pendingUser.orgSlug,
        isResearcher: pendingUser.isResearcher,
        isReviewer: pendingUser.isReviewer,
        isAdmin: false,
    })

    // Create the membership in Clerk only if user is a reviewer.
    if (pendingUser.isReviewer) {
        try {
            const client = await clerkClient()
            const clerkOrg = await client.organizations.getOrganization({ slug: pendingUser.orgSlug })
            await client.organizations.createOrganizationMembership({
                organizationId: clerkOrg.id,
                userId: clerkUserId,
                role: 'org:member',
            })
        } catch (error: unknown) {
            if (isClerkApiError(error) && error.errors[0].code === 'duplicate_organization_membership') {
                logger.info(`User ${clerkUserId} is already a member of Clerk org ${pendingUser.orgSlug}.`)
            } else {
                throw error
            }
        }
    }
}

const CreateAccountSchema = z.object({
    inviteId: z.string(),
    email: z.string().email(),
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
        .where('pendingUser.id', '=', inviteId)
        .where((eb) => eb.fn('lower', ['pendingUser.email']), '=', email.toLowerCase())
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

        await client.users.updateUserMetadata(clerkUser.id, {
            publicMetadata: {
                userId: siUserId,
                // mark user when created inside a github action so it can be later cleaned up after test run
                createdByCIJobId: process.env.GITHUB_JOB,
            },
        })

        // 3. Associate user with organization
        await _associateUserWithOrg(siUserId, clerkUser.id, pendingUser)

        if (!clerkUser.id) {
            throw new ActionFailure({ form: 'Failed to create user account. No user ID was returned.' })
        }

        await updateClerkUserMetadata(siUserId)

        return clerkUser.id // Return Clerk User ID
    } catch (error: unknown) {
        if (error instanceof ActionFailure) {
            throw error
        }
        if (isClerkApiError(error)) {
            const pwnedError = error.errors.find((e) => e.code === 'form_password_pwned')
            if (pwnedError) {
                throw new ActionFailure({
                    form: 'This password has recently been added to the compromised password database, putting your account at risk. Please choose a different password.',
                })
            }

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

    if (pendingUser.email.toLowerCase() !== authUser.primaryEmailAddress?.emailAddress.toLowerCase()) {
        return { success: false, error: 'This invitation is for a different user. Please log out and try again.' }
    }

    // Check if the org membership already exists. If not, this is an existing user flow.
    const existingMembership = await db
        .selectFrom('orgUser')
        .select('id')
        .where('userId', '=', siUserId)
        .where('orgId', '=', pendingUser.localOrgDbId)
        .executeTakeFirst()

    if (!existingMembership) {
        // This is an existing user being added to a new org.
        await _associateUserWithOrg(siUserId, clerkUserId, pendingUser)
    }

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
