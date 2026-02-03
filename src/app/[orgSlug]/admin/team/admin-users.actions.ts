'use server'

import { ActionFailure } from '@/lib/errors'
import { Action } from '@/server/actions/action'
import { onUserInvited } from '@/server/events'
import { sendInviteEmail } from '@/server/mailer'
import { inviteUserSchema, z } from './invite-user.schema'
import { clerkClient } from '@clerk/nextjs/server'

export const orgAdminInviteUserAction = new Action('orgAdminInviteUserAction')
    .params(
        z.object({
            orgSlug: z.string(),
            invite: inviteUserSchema,
            invitedByUserId: z.string(),
        }),
    )
    .middleware(async ({ params: { orgSlug }, db }) =>
        db.selectFrom('org').select(['id as orgId']).where('slug', '=', orgSlug).executeTakeFirstOrThrow(),
    )
    .requireAbilityTo('invite', 'User')
    .handler(async ({ params: { invite, invitedByUserId }, orgId, db }) => {
        // clerk normalizes the email to lowercase, do the same here to avoid case-insensitive matching issues
        invite.email = invite.email.toLowerCase()
        // Check if email belongs to any existing Clerk user (handles both primary and merged emails)
        const clerk = await clerkClient()
        const clerkUsers = await clerk.users.getUserList({ emailAddress: [invite.email] })

        if (clerkUsers.data.length > 0) {
            // Check if this Clerk user is already a member of this org
            const existingOrgMember = await db
                .selectFrom('orgUser')
                .innerJoin('user', 'user.id', 'orgUser.userId')
                .select(['orgUser.id'])
                .where('orgUser.orgId', '=', orgId)
                .where('user.clerkId', '=', clerkUsers.data[0].id)
                .executeTakeFirst()

            if (existingOrgMember) {
                throw new ActionFailure({ email: 'This team member is already in this organization.' })
            }
            // User exists but not in this org - allow invite to proceed
        }

        // Check if the user already exists in pending users, resend invitation if so
        const existingPendingUser = await db
            .selectFrom('pendingUser')
            .select(['id'])
            .where('email', '=', invite.email)
            .where('orgId', '=', orgId)
            .executeTakeFirst()
        if (existingPendingUser) {
            await sendInviteEmail({ emailTo: invite.email, inviteId: existingPendingUser.id })
            return { alreadyInvited: true }
        }

        const record = await db
            .insertInto('pendingUser')
            .values({
                orgId,
                email: invite.email,
                isAdmin: invite.permission == 'admin',
                invitedByUserId,
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        onUserInvited({ invitedEmail: invite.email, pendingId: record.id })
        return { alreadyInvited: false }
    })

export const getPendingUsersAction = new Action('getPendingUsersAction')
    .params(z.object({ orgSlug: z.string() }))
    .middleware(async ({ params: { orgSlug }, db }) => {
        const org = await db
            .selectFrom('org')
            .select(['id as orgId'])
            .where('slug', '=', orgSlug)
            .executeTakeFirstOrThrow()
        return { orgId: org.orgId }
    })
    .requireAbilityTo('view', 'Org')
    .handler(async ({ params: { orgSlug }, db }) => {
        return await db
            .selectFrom('pendingUser')
            .select(['pendingUser.id', 'pendingUser.email'])
            .innerJoin('org', 'pendingUser.orgId', 'org.id')
            .where('org.slug', '=', orgSlug)
            .where('pendingUser.claimedByUserId', 'is', null)
            .orderBy('pendingUser.createdAt', 'desc')
            .execute()
    })

export const reInviteUserAction = new Action('reInviteUserAction')
    .params(
        z.object({
            pendingUserId: z.string(),
            orgSlug: z.string(),
        }),
    )
    .middleware(async ({ params: { orgSlug }, db }) => {
        const org = await db
            .selectFrom('org')
            .select(['id as orgId'])
            .where('slug', '=', orgSlug)
            .executeTakeFirstOrThrow()
        return { orgId: org.orgId }
    })
    .requireAbilityTo('invite', 'User')
    .handler(async ({ params: { orgSlug, pendingUserId }, db }) => {
        const pending = await db
            .selectFrom('pendingUser')
            .innerJoin('org', 'org.id', 'pendingUser.orgId')
            .select(['pendingUser.id', 'pendingUser.email'])
            .where('org.slug', '=', orgSlug)
            .where('pendingUser.id', '=', pendingUserId)
            .executeTakeFirstOrThrow()

        onUserInvited({ invitedEmail: pending.email, pendingId: pending.id })
    })
