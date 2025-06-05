'use server'

import { z } from 'zod'
import { clerkClient, currentUser } from '@clerk/nextjs/server'
import { db } from '@/database'
import { findOrCreateSiUserId } from '@/server/db/mutations'
import { ActionFailure, isClerkApiError } from '@/lib/errors'
import { findOrCreateOrgMembership } from '@/server/mutations' // DB only
import logger from '@/lib/logger'

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

export async function onCreateAccountAction(input: z.infer<typeof CreateAccountSchema>) {
    const { inviteId, email, form } = CreateAccountSchema.parse(input)

    const pendingUser = await db
        .selectFrom('pendingUser')
        .selectAll()
        .where('id', '=', inviteId)
        .where('email', '=', email) // Verify email matches the invite
        .where('claimedByUserId', 'is', null)
        .executeTakeFirst()

    if (!pendingUser) {
        throw new ActionFailure({ form: 'Invalid or already claimed invitation.' })
    }

    try {
        const existingClerkUsers = await clerkClient.users.getUserList({ emailAddress: [email] })
        if (existingClerkUsers.data.length > 0) {
            // This case should ideally be handled by InvitationHandler routing to existing user flow.
            // If an existing user somehow reaches here, it's an anomaly.
            throw new ActionFailure({ email: 'An account with this email already exists. Please sign in to accept the invitation.' })
        }

        const clerkUser = await clerkClient.users.createUser({
            emailAddress: [email],
            password: form.password,
            firstName: form.firstName,
            lastName: form.lastName,
            // publicMetadata for roles will be set by onPendingUserLoginAction
        })
        return clerkUser.id // Return Clerk User ID
    } catch (error: any) {
        if (isClerkApiError(error)) {
            const clerkError = error.errors[0]
            logger.warn({ message: 'Clerk API error during user creation', clerkError, email })
            throw new ActionFailure({ form: clerkError.longMessage || clerkError.message })
        }
        logger.error({ message: 'Non-Clerk error during user creation', error, email })
        throw new ActionFailure({ form: 'Could not create account due to an unexpected error.' })
    }
}

const PendingUserLoginSchema = z.object({
    inviteId: z.string(),
    userId: z.string(), // Clerk User ID
})

export async function onPendingUserLoginAction(input: z.infer<typeof PendingUserLoginSchema>) {
    const { inviteId, userId: clerkUserId } = PendingUserLoginSchema.parse(input)

    const siUserId = await findOrCreateSiUserId(clerkUserId) // Ensure SI user record exists

    const pendingUser = await db
        .selectFrom('pendingUser')
        .innerJoin('org', 'org.id', 'pendingUser.orgId')
        .select([
            'pendingUser.id as pendingUserId',
            'pendingUser.orgId as localOrgDbId', // Local DB org ID
            'pendingUser.isResearcher',
            'pendingUser.isReviewer',
            'org.slug as orgSlug',
            'org.id as orgClerkId', // Assuming org.id in DB is the Clerk Organization ID
        ])
        .where('pendingUser.id', '=', inviteId)
        .where('pendingUser.claimedByUserId', 'is', null)
        .executeTakeFirst()

    if (!pendingUser) {
        throw new ActionFailure({ message: 'Invalid or already claimed invitation for login action.' })
    }

    // 1. Update local DB using existing findOrCreateOrgMembership
    const orgMembershipDetails = await findOrCreateOrgMembership({
        userId: siUserId,
        slug: pendingUser.orgSlug,
        isResearcher: pendingUser.isResearcher,
        isReviewer: pendingUser.isReviewer,
        isAdmin: false, // Default for new invitees; orgAdminAction is for existing admins to manage
    })

    try {
        // 2. Add to Clerk Organization
        await clerkClient.organizations.createOrganizationMembership({
            organizationId: pendingUser.orgClerkId, // This MUST be the Clerk Organization ID
            userId: clerkUserId,
            role: orgMembershipDetails.isAdmin ? 'org:admin' : 'org:member', // Adjust role mapping as needed
        })

        // 3. Update Clerk User Public Metadata
        const clerkUser = await clerkClient.users.getUser(clerkUserId)
        const existingMetadataOrgs = (clerkUser.publicMetadata?.orgs as UserPublicMetadata['orgs']) || []
        const newOrgEntry = {
            slug: pendingUser.orgSlug,
            isAdmin: orgMembershipDetails.isAdmin,
            isResearcher: orgMembershipDetails.isResearcher,
            isReviewer: orgMembershipDetails.isReviewer,
        }
        // Remove if existing, then add updated
        const updatedOrgs = existingMetadataOrgs.filter((o) => o.slug !== pendingUser.orgSlug)
        updatedOrgs.push(newOrgEntry)

        await clerkClient.users.updateUser(clerkUserId, {
            publicMetadata: { ...clerkUser.publicMetadata, userId: siUserId, orgs: updatedOrgs },
        })
    } catch (clerkError: any) {
        logger.error({ message: 'Clerk update failed during onPendingUserLoginAction', error: clerkError, clerkUserId, orgSlug: pendingUser.orgSlug });
        // Note: DB changes are not reverted here. This could lead to inconsistency.
        // For critical apps, consider a transaction or a cleanup mechanism.
        throw new ActionFailure({ message: 'Failed to update your membership details with our authentication provider. Please contact support.' })
    }

    // 4. Mark invite as claimed in local DB
    await db
        .updateTable('pendingUser')
        .set({ claimedByUserId: siUserId })
        .where('id', '=', pendingUser.pendingUserId)
        .execute()

    return { success: true }
}

const AcceptInviteExistingUserSchema = z.object({
    inviteId: z.string(),
})

export async function acceptInviteForExistingUserAction(input: z.infer<typeof AcceptInviteExistingUserSchema>) {
    const { inviteId } = AcceptInviteExistingUserSchema.parse(input)
    const authUser = await currentUser() // Clerk user from session

    if (!authUser) {
        throw new ActionFailure({ message: 'User not authenticated.' })
    }
    const clerkUserId = authUser.id
    const siUserId = await findOrCreateSiUserId(clerkUserId, {
        firstName: authUser.firstName,
        lastName: authUser.lastName,
        email: authUser.emailAddresses.find(e => e.id === authUser.primaryEmailAddressId)?.emailAddress
    })


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
            'org.id as orgClerkId', // Assuming org.id in DB is the Clerk Organization ID
        ])
        .where('pendingUser.id', '=', inviteId)
        .where('pendingUser.claimedByUserId', 'is', null)
        .executeTakeFirst()

    if (!pendingUser) {
        return { success: false, error: 'Invalid or already claimed invitation.' }
    }

    // 1. Update local DB
    const orgMembershipDetails = await findOrCreateOrgMembership({
        userId: siUserId,
        slug: pendingUser.orgSlug,
        isResearcher: pendingUser.isResearcher,
        isReviewer: pendingUser.isReviewer,
        isAdmin: false, // Default for invitees, even existing users joining a new org
    })

    try {
        // 2. Add to Clerk Organization (or update role if already member)
        try {
             await clerkClient.organizations.createOrganizationMembership({
                organizationId: pendingUser.orgClerkId, // This MUST be the Clerk Organization ID
                userId: clerkUserId,
                role: orgMembershipDetails.isAdmin ? 'org:admin' : 'org:member',
            })
        } catch (e: any) {
            if (e.errors && e.errors[0] && e.errors[0].code === 'duplicate_organization_membership') {
                logger.info(`User ${clerkUserId} already member of Clerk org ${pendingUser.orgClerkId}. Role update might be needed separately if changed.`);
                // If roles can change via invite for existing members, you might need:
                // await clerkClient.organizations.updateOrganizationMembership({ organizationId: pendingUser.orgClerkId, userId: clerkUserId, role: ... });
            } else {
                throw e; // Re-throw if it's another error
            }
        }

        // 3. Update Clerk User Public Metadata
        const clerkUserToUpdate = authUser; // Already have this from currentUser()
        const existingMetadataOrgs = (clerkUserToUpdate.publicMetadata?.orgs as UserPublicMetadata['orgs']) || []
        const newOrgEntry = {
            slug: pendingUser.orgSlug,
            isAdmin: orgMembershipDetails.isAdmin,
            isResearcher: orgMembershipDetails.isResearcher,
            isReviewer: orgMembershipDetails.isReviewer,
        }
        const updatedOrgs = existingMetadataOrgs.filter((o) => o.slug !== pendingUser.orgSlug)
        updatedOrgs.push(newOrgEntry)

        await clerkClient.users.updateUser(clerkUserId, {
            publicMetadata: { ...clerkUserToUpdate.publicMetadata, userId: siUserId, orgs: updatedOrgs },
        })
    } catch (clerkError: any) {
        logger.error({ message: 'Clerk update failed during acceptInviteForExistingUserAction', error: clerkError, clerkUserId, orgSlug: pendingUser.orgSlug });
        throw new ActionFailure({ message: 'Failed to update your membership details with our authentication provider. Please contact support.' })
    }

    // 4. Mark invite as claimed in local DB
    await db
        .updateTable('pendingUser')
        .set({ claimedByUserId: siUserId })
        .where('id', '=', pendingUser.pendingUserId)
        .execute()

    return { success: true, organizationName: pendingUser.orgName }
}
