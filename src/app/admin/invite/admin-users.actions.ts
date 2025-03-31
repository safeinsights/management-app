'use server'

import { db } from '@/database'
import { clerkClient } from '@clerk/nextjs/server'
import { inviteUserSchema } from './admin-users.schema'
import { adminAction } from '@/server/actions/wrappers'
import { sendWelcomeEmail } from '@/server/mailgun'
import { findOrCreateClerkOrganization } from '@/server/clerk'

export const adminInviteUserAction = adminAction(async (invite) => {
    const client = await clerkClient()

    const clerkUser = await client.users.createUser({
        firstName: invite.firstName,
        lastName: invite.lastName,
        emailAddress: [invite.email],
        password: invite.password,
    })

    if (invite.isReviewer) {
        const org = await db
            .selectFrom('member')
            .select(['identifier', 'name'])
            .where('id', '=', invite.organizationId)
            .executeTakeFirstOrThrow()

        const clerkOrg = await findOrCreateClerkOrganization({ slug: org.identifier, name: org.name })

        await client.organizations.createOrganizationMembership({
            organizationId: clerkOrg.id,
            userId: clerkUser.id,
            role: 'org:member',
        })
    }

    return await db.transaction().execute(async (trx) => {
        const existingUser = await trx
            .selectFrom('user')
            .select('id')
            .where('clerkId', '=', clerkUser.id)
            .executeTakeFirst()

        if (existingUser) {
            throw new Error(`User with clerkId ${clerkUser.id} already exists`)
        }

        const siUser = await trx
            .insertInto('user')
            .values({
                clerkId: clerkUser.id,
                firstName: invite.firstName,
                lastName: invite.lastName,
                email: invite.email,
                isResearcher: !!invite.isResearcher,
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        await trx
            .insertInto('memberUser')
            .values({
                userId: siUser.id,
                memberId: invite.organizationId,
                isReviewer: !!invite.isReviewer,
                isAdmin: false,
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        const fullName = `${invite.firstName} ${invite.lastName}`
        await sendWelcomeEmail(invite.email, fullName)

        // Return the created user record.
        return {
            ...invite,
            clerkId: clerkUser.id,
            userId: siUser.id,
        }
    })
}, inviteUserSchema)
