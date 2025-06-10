'use server'

import { db } from '@/database'
import { z, inviteUserSchema } from './invite-user.schema'
import { orgActionContext, orgAdminAction } from '@/server/actions/wrappers'
import { sendInviteEmail } from '@/server/mailer'
import { onUserInvited } from '@/server/events'
import { ActionFailure } from '@/lib/errors'

export const orgAdminInviteUserAction = orgAdminAction(
    async ({ invite }) => {
        const { org } = await orgActionContext()

        // Check if the user (by email) is already inside this organization
        const existingOrgUser = await db
            .selectFrom('user')
            .innerJoin('orgUser', 'user.id', 'orgUser.userId')
            .select('user.id')
            .where('user.email', '=', invite.email)
            .where('orgUser.orgId', '=', org.id)
            .executeTakeFirst()

        if (existingOrgUser) {
            throw new ActionFailure({ email: 'This team member is already in this organization.' })
        }

        // Check if the user already exists in pending users, resend invitation if so
        const existingPendingUser = await db
            .selectFrom('pendingUser')
            .select(['id', 'email'])
            .where('email', '=', invite.email)
            .where('orgId', '=', org.id)
            .executeTakeFirst()
        if (existingPendingUser) {
            await sendInviteEmail({ emailTo: invite.email, inviteId: existingPendingUser.id })
            return
        }
        const record = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: invite.email,
                isResearcher: invite.role == 'multiple' || invite.role == 'researcher',
                isReviewer: invite.role == 'multiple' || invite.role == 'reviewer',
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        onUserInvited({ invitedEmail: invite.email, pendingId: record.id })
    },
    z.object({
        orgSlug: z.string(),
        invite: inviteUserSchema,
    }),
)

export const getPendingUsersAction = orgAdminAction(
    async ({ orgSlug: _ }) => {
        const { org } = await orgActionContext()

        return await db
            .selectFrom('pendingUser')
            .select(['id', 'email'])
            .where('orgId', '=', org.id)
            .where('claimedByUserId', 'is', null) // Only show pending invites that haven't been claimed yet
            .orderBy('createdAt', 'desc')
            .execute()
    },
    z.object({
        orgSlug: z.string(),
    }),
)

export const reInviteUserAction = orgAdminAction(
    async ({ orgSlug, pendingUserId }) => {
        const pending = await db
            .selectFrom('pendingUser')
            .innerJoin('org', 'org.id', 'pendingUser.orgId')
            .select(['pendingUser.id', 'pendingUser.email'])
            .where('org.slug', '=', orgSlug)
            .where('pendingUser.id', '=', pendingUserId)
            .executeTakeFirstOrThrow()

        onUserInvited({ invitedEmail: pending.email, pendingId: pending.id })
    },
    z.object({
        pendingUserId: z.string(),
        orgSlug: z.string(),
    }),
)
