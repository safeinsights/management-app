'use server'

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
    .middleware(async ({ params: { orgSlug }, db }) =>
        db.selectFrom('org').select(['id as orgId']).where('slug', '=', orgSlug).executeTakeFirstOrThrow(),
    )
    .requireAbilityTo('invite', 'User')
    .handler(async ({ params: { invite }, orgId, db }) => {
        // Check if the user already exists in pending users, resend invitation if so
        const existingPendingUser = await db
            .selectFrom('pendingUser')
            .select(['id', 'email'])
            .where('email', '=', invite.email)
            .where('orgId', '=', orgId)
            .executeTakeFirst()
        if (existingPendingUser) {
            await sendInviteEmail({ emailTo: invite.email, inviteId: existingPendingUser.id })
            return
        }

        const record = await db
            .insertInto('pendingUser')
            .values({
                orgId,
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
    .middleware(async ({ params: { orgSlug }, db }) => {
        const org = await db
            .selectFrom('org')
            .select(['id as orgId'])
            .where('slug', '=', orgSlug)
            .executeTakeFirstOrThrow()
        return { orgId: org.orgId }
    })
    .requireAbilityTo('view', 'Team')
    .handler(async ({ params: { orgSlug }, db }) => {
        return await db
            .selectFrom('pendingUser')
            .select(['pendingUser.id', 'pendingUser.email'])
            .innerJoin('org', 'pendingUser.orgId', 'org.id')
            .where('org.slug', '=', orgSlug)
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
