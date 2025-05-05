'use server'

import { db } from '@/database'
import { clerkClient } from '@clerk/nextjs/server'
import { inviteUserSchema } from './admin-users.schema'
import { adminAction } from '@/server/actions/wrappers'
import { sendWelcomeEmail } from '@/server/mailgun'
import { findOrCreateClerkOrganization } from '@/server/clerk'
import { isClerkApiError, SanitizedError } from '@/lib/errors'
import logger from '@/lib/logger'

export const adminInviteUserAction = adminAction(async (invite) => {
    // Check if the user already exists in pending users, resend invitation if so
    const existingPendingUser = await getPendingUsersByEmailAction({ email: invite.email })

    if (existingPendingUser) {
        return reInviteUserAction({ email: invite.email })
    }

    const client = await clerkClient()
    let clerkUserId = ''

    try {
        const clerkUser = await client.users.createUser({
            emailAddress: [invite.email],
            password: invite.password,
            firstName: '',
            lastName: '',
        })
        clerkUserId = clerkUser.id
    } catch (error) {
        if (isClerkApiError(error)) {
            // the user is an admin, they can see the clerk error
            throw new SanitizedError(error.errors[0].message)
        }
        throw error
    }

    if (invite.isReviewer) {
        const org = await db
            .selectFrom('org')
            .select(['org.slug', 'name'])
            .where('slug', '=', invite.orgSlug)
            .executeTakeFirstOrThrow()

        const clerkOrg = await findOrCreateClerkOrganization({ slug: org.slug, name: org.name })

        await client.organizations.createOrganizationMembership({
            organizationId: clerkOrg.id,
            userId: clerkUserId,
            role: 'org:member',
        })
    }

    return await db.transaction().execute(async (trx) => {
        // Fetch the database org ID (UUID) using the provided slug
        const dbOrg = await trx.selectFrom('org').select('id').where('slug', '=', invite.orgSlug).executeTakeFirst()

        if (!dbOrg) {
            throw new Error(`Organization with slug ${invite.orgSlug} not found in the database.`)
        }

        const pendingUser = await trx
            .insertInto('pendingUser')
            .values({
                organizationId: dbOrg.id,
                orgSlug: invite.orgSlug,
                email: invite.email,
                isResearcher: !!invite.isResearcher,
                isReviewer: !!invite.isReviewer,
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        await sendWelcomeEmail(invite.email)

        return {
            clerkId: clerkUserId,
            pendingUserId: pendingUser.id,
            email: invite.email,
        }
    })
}, inviteUserSchema)

export const getPendingUsersAction = adminAction(async ({ orgSlug }: { orgSlug: string }) => {
    return await db
        .selectFrom('pendingUser')
        .select(['id', 'email'])
        .where('orgSlug', '=', orgSlug)
        .orderBy('createdAt', 'desc')
        .execute()
})

export const getPendingUsersByEmailAction = adminAction(async ({ email }: { email: string }) => {
    return await db.selectFrom('pendingUser').select(['id', 'email']).where('email', '=', email).executeTakeFirst()
})

export const reInviteUserAction = adminAction(async ({ email }: { email: string }) => {
    try {
        await sendWelcomeEmail(email)
        return { success: true }
    } catch (error) {
        logger.error(error)
        return { success: false }
    }
})

export const deletePendingUserAction = adminAction(async ({ id }: { id: string }) => {
    try {
        await db.deleteFrom('pendingUser').where('id', '=', id).execute()
        return { success: true }
    } catch (error) {
        logger.error(error)
        return { success: false }
    }
})
