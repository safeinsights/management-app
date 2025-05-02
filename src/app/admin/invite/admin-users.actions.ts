'use server'

import { db } from '@/database'
import { clerkClient } from '@clerk/nextjs/server'
import { inviteUserSchema } from './admin-users.schema'
import { adminAction } from '@/server/actions/wrappers'
import { sendWelcomeEmail } from '@/server/mailgun'
import { findOrCreateClerkOrganization } from '@/server/clerk'
import { isClerkApiError, SanitizedError } from '@/lib/errors'

export const adminInviteUserAction = adminAction(async (invite) => {
    const client = await clerkClient()
    let clerkUserId = ''
    let clerkFirstName = ''
    let clerkLastName = ''

    try {
        const clerkUser = await client.users.createUser({
            emailAddress: [invite.email],
            password: invite.password,
            firstName: '',
            lastName: '',
        })
        clerkUserId = clerkUser.id

        clerkFirstName = clerkUser.firstName ?? ''
        clerkLastName = clerkUser.lastName ?? ''
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
            .where('id', '=', invite.organizationId)
            .executeTakeFirstOrThrow()

        const clerkOrg = await findOrCreateClerkOrganization({ slug: org.slug, name: org.name })

        await client.organizations.createOrganizationMembership({
            organizationId: clerkOrg.id,
            userId: clerkUserId,
            role: 'org:org',
        })
    }

    return await db.transaction().execute(async (trx) => {
        const existingUser = await trx
            .selectFrom('user')
            .select('id')
            .where('clerkId', '=', clerkUserId)
            .executeTakeFirst()

        if (existingUser) {
            throw new Error(`User with clerkId ${clerkUserId} already exists`)
        }

        const siUser = await trx
            .insertInto('user')
            .values({
                clerkId: clerkUserId,
                email: invite.email,
                firstName: clerkFirstName,
                lastName: clerkLastName,
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        await trx
            .insertInto('orgUser')
            .values({
                userId: siUser.id,
                orgId: invite.organizationId,
                isResearcher: !!invite.isResearcher,
                isReviewer: !!invite.isReviewer,
                isAdmin: false,
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        await sendWelcomeEmail(invite.email)

        // Return the created user record.
        return {
            ...invite,
            clerkId: clerkUserId,
            userId: siUser.id,
        }
    })
}, inviteUserSchema)
