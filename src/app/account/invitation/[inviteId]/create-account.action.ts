'use server'

import type { DBExecutor } from '@/database'
import { enforcedLegalDocumentTypes } from '@/schema/legal-document'
import { Action, ActionFailure, z } from '@/server/actions/action'
import { updateClerkUserMetadata } from '@/server/clerk'
import { getUserPublicKey } from '@/server/db/queries'
import { onUserAcceptInvite } from '@/server/events'
import { extractClerkCodeAndMessage, isClerkApiError } from '@/lib/errors'
import { toRecord } from '@/lib/permissions'
import { clerkClient } from '@clerk/nextjs/server'

// Runs inside the account-creation transaction so an account never exists without this evidence.
// Submitted ids are re-checked, not trusted: the form only shows the global tos/pn and the invite
// org's own ropa/dopa, so only published versions of those are accepted.
async function recordSignupAcknowledgements(db: DBExecutor, userId: string, orgId: string, versionIds: string[]) {
    if (!versionIds.length) return

    const eligible = await db
        .selectFrom('legalDocumentVersion')
        .innerJoin('legalDocument', 'legalDocument.id', 'legalDocumentVersion.legalDocumentId')
        .select('legalDocumentVersion.id')
        .where('legalDocumentVersion.id', 'in', versionIds)
        .where('legalDocumentVersion.publishedAt', 'is not', null)
        .where('legalDocument.type', 'in', [...enforcedLegalDocumentTypes])
        // Global tos/pn are org-neutral (orgId null); the only org-scoped rows the form shows belong
        // to the invite's own org. Anything scoped to another org was never displayed here.
        .where((eb) => eb.or([eb('legalDocument.orgId', 'is', null), eb('legalDocument.orgId', '=', orgId)]))
        .execute()

    if (!eligible.length) return

    await db
        .insertInto('legalDocumentAcknowledgement')
        .values(eligible.map((version) => ({ legalDocumentVersionId: version.id, userId })))
        .onConflict((oc) => oc.constraint('legal_document_acknowledgement_unique').doNothing())
        .execute()
}

// Invites are bearer credentials, so `claim PendingUser` is unconditioned in permissions.ts. The
// `claimedByUserId` guard stops one user burning an invite somebody else accepted.
export const onPendingUserLoginAction = new Action('onPendingUserLoginAction')
    .params(z.object({ inviteId: z.string() }))
    .requireAbilityTo('claim', 'PendingUser')
    .handler(async ({ params: { inviteId }, session, db }) => {
        await db
            .updateTable('pendingUser')
            .set({ claimedByUserId: session.user.id })
            .where('id', '=', inviteId)
            .where((eb) => eb.or([eb('claimedByUserId', 'is', null), eb('claimedByUserId', '=', session.user.id)]))
            // returning() so an update matching nothing raises instead of looking like success.
            .returning('id')
            .executeTakeFirstOrThrow(() => new ActionFailure({ invite: 'not found' }))
    })

// Deliberately session-less: the link is opened before the recipient has an account. Exposure is
// limited by the query — only an unclaimed invite resolves.
export const getOrgInfoForInviteAction = new Action('getOrgInfoForInviteAction')
    .params(
        z.object({
            inviteId: z.string(),
        }),
    )
    .handler(async function ({ params: { inviteId }, db }) {
        return await db
            .selectFrom('org')
            .innerJoin('pendingUser', 'pendingUser.orgId', 'org.id')
            .leftJoin('user as invitingUser', 'invitingUser.id', 'pendingUser.invitedByUserId')
            .select([
                'org.id',
                'org.name',
                'org.slug',
                'pendingUser.isAdmin',
                'pendingUser.email',
                'invitingUser.firstName as invitingUserFirstName',
                'invitingUser.lastName as invitingUserLastName',
            ])
            .where('pendingUser.id', '=', inviteId)
            .where('pendingUser.claimedByUserId', 'is', null)
            .executeTakeFirstOrThrow()
    })

// Declining is strictly weaker than accepting, so bearing the id authorizes it. Claimed invites
// are spent — org admin only.
export const onRevokeInviteAction = new Action('onRevokeInviteAction')
    .params(
        z.object({
            inviteId: z.string(),
        }),
    )
    .handler(async function ({ params: { inviteId }, db, session }) {
        // No requireAbilityTo, so an unauthenticated caller reaches the handler with a null session.
        if (!session) {
            throw new ActionFailure({ permission_denied: 'cannot revoke this invite' })
        }

        const invite = await db
            .selectFrom('pendingUser')
            .select(['id', 'orgId', 'claimedByUserId'])
            .where('id', '=', inviteId)
            .executeTakeFirstOrThrow(() => new ActionFailure({ invite: 'not found' }))

        const isOrgAdmin = session.ability.can('revoke', toRecord('PendingUser', { orgId: invite.orgId }))
        const isBearerOfUnclaimedInvite = invite.claimedByUserId === null

        if (!isOrgAdmin && !isBearerOfUnclaimedInvite) {
            throw new ActionFailure({ permission_denied: 'cannot revoke this invite' })
        }

        await db.deleteFrom('pendingUser').where('id', '=', invite.id).executeTakeFirstOrThrow()
    })

// Bearer credential by design: the membership attaches to the accepting session's account. The
// invariant is no privilege escalation — the acting identity comes from the session, never from a
// parameter, and the granted role comes only from the invite row (OTTER-724 / MA-9).
export const onJoinTeamAccountAction = new Action('onJoinTeamAccountAction')
    .params(
        z.object({
            inviteId: z.string(),
        }),
    )

    .handler(async function ({ params: { inviteId }, db, session }) {
        // Without requireAbilityTo the handler is reached with a null session.
        if (!session) {
            throw new ActionFailure({ permission_denied: 'cannot accept this invite' })
        }

        const user = await db
            .selectFrom('user')
            .select(['id', 'email', 'clerkId'])
            .where('id', '=', session.user.id)
            .executeTakeFirst()

        if (!user) {
            throw new ActionFailure({ user: 'does not exist' })
        }

        const siUser = await db.transaction().execute(async (trx) => {
            // Claim first, atomically: concurrent accepts race on this row, and a failure below
            // rolls the claim back with the membership.
            const invite = await trx
                .updateTable('pendingUser')
                .set({ claimedByUserId: user.id })
                .where('id', '=', inviteId)
                .where('claimedByUserId', 'is', null)
                .returning(['orgId', 'isAdmin'])
                .executeTakeFirstOrThrow(() => new ActionFailure({ invite: 'not found' }))

            const orgUser = await trx
                .selectFrom('orgUser')
                .where('orgId', '=', invite.orgId)
                .where('userId', '=', user.id)
                .select(['id', 'isAdmin'])
                .executeTakeFirst()

            // The invite's role is honoured as a grant (promote-by-invite) but never as a
            // downgrade — demotion has its own admin-only flow.
            if (orgUser) {
                if (invite.isAdmin && !orgUser.isAdmin) {
                    await trx
                        .updateTable('orgUser')
                        .set({ isAdmin: true })
                        .where('id', '=', orgUser.id)
                        .executeTakeFirstOrThrow()
                }
                return user
            }

            // isAdmin comes from the invite row alone; no caller-supplied input can raise it.
            await trx
                .insertInto('orgUser')
                .values({
                    userId: user.id,
                    orgId: invite.orgId,
                    isAdmin: invite.isAdmin,
                })
                .returning('id')
                .executeTakeFirstOrThrow()

            return user
        })

        await updateClerkUserMetadata(siUser.id)
        onUserAcceptInvite(siUser.id)

        // Checked here too: the client RequireUserKey guard reads Clerk metadata, which can be
        // stale right after this server-side update.
        const needsUserKey = !(await getUserPublicKey(siUser.id))

        return { ...siUser, needsUserKey }
    })

export const onCreateAccountAction = new Action('onCreateAccountAction')
    .params(
        z.object({
            inviteId: z.string(),
            form: z.object({
                firstName: z.string(),
                lastName: z.string(),
                password: z.string(),
            }),
            // The versions the form displayed, not "whatever is latest now". Validated as uuids
            // because a malformed one reaches Postgres as a 22P02 inside the transaction.
            acknowledgedVersionIds: z.array(z.string().uuid()).optional(),
        }),
    )

    .handler(async function ({ params: { inviteId, form, acknowledgedVersionIds = [] }, db }) {
        // Unauthenticated by necessity, so the invite id is the only credential. A claimed invite
        // is spent and must not create a second account.
        const invite = await db
            .selectFrom('pendingUser')
            .selectAll('pendingUser')
            .where('id', '=', inviteId)
            .where('claimedByUserId', 'is', null)
            .executeTakeFirstOrThrow(() => new ActionFailure({ invite: 'not found' }))

        const clerk = await clerkClient()

        let clerkId = ''

        const users = await clerk.users.getUserList({ emailAddress: [invite.email] })
        if (users.data.length) {
            clerkId = users.data[0].id
        } else {
            const createdByCIJobId = process.env.GITHUB_JOB
            const privateMetadata = createdByCIJobId ? { createdByCIJobId } : undefined
            let clerkUser
            try {
                clerkUser = await clerk.users.createUser({
                    firstName: form.firstName,
                    lastName: form.lastName,
                    emailAddress: [invite.email],
                    password: form.password,
                    privateMetadata,
                })
            } catch (error) {
                // Clerk rejects weak/compromised passwords with a 422; surface its reason inline.
                if (isClerkApiError(error)) {
                    const { code, message } = extractClerkCodeAndMessage(error)
                    throw new ActionFailure({ form: message, code })
                }
                throw error
            }
            clerkId = clerkUser.id

            const primaryEmail = clerkUser.emailAddresses.find((e) => e.emailAddress === invite.email)
            if (primaryEmail) {
                await clerk.emailAddresses.updateEmailAddress(primaryEmail.id, { verified: true })
            }
        }

        const siUser = await db.transaction().execute(async (trx) => {
            const existing = await trx
                .selectFrom('user')
                .select(['id', 'clerkId'])
                .where('email', '=', invite.email)
                .executeTakeFirst()

            let user: { id: string }

            if (existing) {
                if (existing.clerkId === clerkId) {
                    user = existing
                } else {
                    throw new ActionFailure({ user: 'already has account' })
                }
            } else {
                user = await trx
                    .insertInto('user')
                    .values({
                        clerkId,
                        firstName: form.firstName,
                        lastName: form.lastName,
                        email: invite.email,
                    })
                    .returning('id')
                    .executeTakeFirstOrThrow()
            }

            const orgUser = await trx
                .selectFrom('orgUser')
                .where('orgId', '=', invite.orgId)
                .where('userId', '=', user.id)
                .select(['id'])
                .executeTakeFirst()

            if (orgUser) {
                throw new ActionFailure({ team: 'already a member' })
            }

            // isAdmin comes from the invite row alone; the form cannot influence the granted role.
            await trx
                .insertInto('orgUser')
                .values({
                    userId: user.id,
                    orgId: invite.orgId,
                    isAdmin: invite.isAdmin,
                })
                .returning('id')
                .executeTakeFirstOrThrow()

            // Claimed in the same transaction as the membership grant, so the guard is
            // self-enforcing rather than relying on a later client call.
            await trx
                .updateTable('pendingUser')
                .set({ claimedByUserId: user.id })
                .where('id', '=', inviteId)
                .where('claimedByUserId', 'is', null)
                .returning('id')
                .executeTakeFirstOrThrow(() => new ActionFailure({ invite: 'not found' }))

            await recordSignupAcknowledgements(trx, user.id, invite.orgId, acknowledgedVersionIds)

            return user
        })

        await updateClerkUserMetadata(siUser.id)
        onUserAcceptInvite(siUser.id)

        return { userId: siUser.id }
    })
