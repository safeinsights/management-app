'use server'

import { db } from '@/database'
import { clerkClient } from '@clerk/nextjs/server'
import { InviteUserFormValues, inviteUserSchema } from './admin-users.schema'

export async function adminInviteUserAction(
    invite: InviteUserFormValues,
): Promise<InviteUserFormValues & { userId: string }> {
    inviteUserSchema.parse(invite) // validate

    const client = await clerkClient()

    const clerkUser = await client.users.createUser({
        firstName: invite.firstName,
        lastName: invite.lastName,
        emailAddress: [invite.email],
        password: invite.password,
    })

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

        // Return the created user record.
        return {
            ...invite,
            clerkId: clerkUser.id,
            userId: siUser.id,
        }
    })
}
