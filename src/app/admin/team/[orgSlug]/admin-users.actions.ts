'use server'

import { db } from '@/database'
import { z, inviteUserSchema } from './invite-user.schema'
import { sendInviteEmail } from '@/server/mailer'
import { onUserInvited } from '@/server/events'
import { Action } from '@/server/actions/action'

export const orgAdminInviteUserAction = new Action('orgAdminInviteUserAction')
    .params(
        z.object({
            orgSlug: z.string(),
            invite: inviteUserSchema,
        }),
    )
    .requireAbilityTo('invite', 'User')
    .handler(async ({ invite }, { session }) => {
        // Check if the user already exists in pending users, resend invitation if so
        const existingPendingUser = await db
            .selectFrom('pendingUser')
            .select(['id', 'email'])
            .where('email', '=', invite.email)
            .executeTakeFirst()
        if (existingPendingUser) {
            await sendInviteEmail({ emailTo: invite.email, inviteId: existingPendingUser.id })
            return
        }
        const record = await db
            .insertInto('pendingUser')
            .values({
                orgId: session.team.id,
                email: invite.email,
                isResearcher: invite.role == 'multiple' || invite.role == 'researcher',
                isReviewer: invite.role == 'multiple' || invite.role == 'reviewer',
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        onUserInvited({ invitedEmail: invite.email, pendingId: record.id })
    })

export const getPendingUsersAction = new Action('getPendingUsersAction')
    .params(z.object({ orgSlug: z.string() }))
    .requireAbilityTo('read', 'Team')
    .handler(async (_, { session }) => {
        return await db
            .selectFrom('pendingUser')
            .select(['id', 'email'])
            .where('orgId', '=', session.team.id)
            .orderBy('createdAt', 'desc')
            .execute()
    })

export const reInviteUserAction = new Action('reInviteUserAction')
    .params(
        z.object({
            pendingUserId: z.string(),
            orgSlug: z.string(),
        }),
    )
    .requireAbilityTo('invite', 'User')
    .handler(async ({ orgSlug, pendingUserId }) => {
        const pending = await db
            .selectFrom('pendingUser')
            .innerJoin('org', 'org.id', 'pendingUser.orgId')
            .select(['pendingUser.id', 'pendingUser.email'])
            .where('org.slug', '=', orgSlug)
            .where('pendingUser.id', '=', pendingUserId)
            .executeTakeFirstOrThrow()

        onUserInvited({ invitedEmail: pending.email, pendingId: pending.id })
    })
