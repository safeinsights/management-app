'use server'

import type { DBExecutor } from '@/database'
import { enforcedLegalDocumentTypes } from '@/schema/legal-document'
import { Action, ActionFailure, z } from '@/server/actions/action'
import { updateClerkUserMetadata } from '@/server/clerk'
import { getUserPublicKey } from '@/server/db/queries'
import { onUserAcceptInvite } from '@/server/events'
import { extractClerkCodeAndMessage, isClerkApiError } from '@/lib/errors'
import { clerkClient } from '@clerk/nextjs/server'

/**
 * Record the new user's agreement to the documents the signup form showed them.
 *
 * Runs inside the account-creation transaction: an account that exists without the evidence of what
 * its owner agreed to is the failure worth preventing, and the insert is pure DB, so the only way it
 * fails is a version id that should not have been submitted.
 *
 * The submitted ids are re-checked here rather than trusted — only published versions of the two
 * globally-scoped public documents are accepted, so a crafted request cannot manufacture an
 * acknowledgement of an org- or study-scoped agreement, or of an unpublished draft.
 */
async function recordSignupAcknowledgements(db: DBExecutor, userId: string, versionIds: string[]) {
    if (!versionIds.length) return

    const eligible = await db
        .selectFrom('legalDocumentVersion')
        .innerJoin('legalDocument', 'legalDocument.id', 'legalDocumentVersion.legalDocumentId')
        .select('legalDocumentVersion.id')
        .where('legalDocumentVersion.id', 'in', versionIds)
        .where('legalDocumentVersion.publishedAt', 'is not', null)
        .where('legalDocument.type', 'in', [...enforcedLegalDocumentTypes])
        .execute()

    if (!eligible.length) return

    await db
        .insertInto('legalDocumentAcknowledgement')
        .values(eligible.map((version) => ({ legalDocumentVersionId: version.id, userId })))
        .onConflict((oc) => oc.constraint('legal_document_acknowledgement_unique').doNothing())
        .execute()
}

export const onPendingUserLoginAction = new Action('onPendingUserLoginAction')
    .params(z.object({ inviteId: z.string() }))
    .requireAbilityTo('claim', 'PendingUser')
    .handler(async ({ params: { inviteId }, session, db }) => {
        await db
            .updateTable('pendingUser')
            .set({ claimedByUserId: session.user.id })
            .where('id', '=', inviteId)
            .executeTakeFirstOrThrow()
    })

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
            .executeTakeFirstOrThrow()
    })

export const onRevokeInviteAction = new Action('onRevokeInviteAction')
    .params(
        z.object({
            inviteId: z.string(),
        }),
    )
    .handler(async function ({ params: { inviteId }, db }) {
        await db.deleteFrom('pendingUser').where('id', '=', inviteId).executeTakeFirstOrThrow()
    })

export const onJoinTeamAccountAction = new Action('onJoinTeamAccountAction')
    .params(
        z.object({
            inviteId: z.string(),
            loggedInEmail: z.string().optional(), // provide if merging team invite to existing user account
        }),
    )

    .handler(async function ({ params: { inviteId, loggedInEmail }, db }) {
        const invite = await db
            .selectFrom('pendingUser')
            .selectAll('pendingUser')
            .where('id', '=', inviteId)
            .executeTakeFirstOrThrow(() => new ActionFailure({ invite: 'not found' }))

        let user = await db
            .selectFrom('user')
            .select(['id', 'email', 'clerkId'])
            .where('email', '=', loggedInEmail ? loggedInEmail : invite.email)
            .executeTakeFirst()

        // If user not found by email, check if email belongs to any existing Clerk user (handles merged emails)
        if (!user) {
            const clerk = await clerkClient()
            const clerkUsers = await clerk.users.getUserList({ emailAddress: [invite.email] })

            if (clerkUsers.data.length > 0) {
                // Check if this Clerk user has a corresponding user in the DB
                user = await db
                    .selectFrom('user')
                    .select(['id', 'email', 'clerkId'])
                    .where('clerkId', '=', clerkUsers.data[0].id)
                    .executeTakeFirst()
            }
        }

        if (!user) {
            throw new ActionFailure({ user: 'does not exist' })
        }

        const siUser = await db.transaction().execute(async (trx) => {
            const orgUser = await trx
                .selectFrom('orgUser')
                .where('orgId', '=', invite.orgId)
                .where('userId', '=', user.id)
                .select(['id'])
                .executeTakeFirst()

            // If the user is already a member, we simply return the user so the
            // rest of the handler can continue (adding the invite email to the
            // account, marking the invite as claimed, etc.).
            if (orgUser) {
                return user
            }

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

        if (loggedInEmail) {
            // add the invite email to the existing user's email addresses in clerk
            const clerk = await clerkClient()

            const emailAddress = await clerk.emailAddresses.createEmailAddress({
                userId: user.clerkId,
                emailAddress: invite.email,
            })

            // auto-verify email (the user has already followed the email invite link)
            await clerk.emailAddresses.updateEmailAddress(emailAddress.id, { verified: true })
        }

        await updateClerkUserMetadata(siUser.id)
        onUserAcceptInvite(siUser.id)

        // mark invite as claimed by this user so it no longer shows in pending lists
        await db
            .updateTable('pendingUser')
            .set({ claimedByUserId: siUser.id })
            .where('id', '=', inviteId)
            .where('claimedByUserId', 'is', null)
            .executeTakeFirst()

        // Checked here too because the client RequireUserKey guard reads Clerk useUser() metadata,
        // which can be stale right after this server-side update.
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
                confirmPassword: z.string(),
            }),
            // The versions the form actually displayed, not "whatever is latest now". If a new
            // version is published between page load and submit we record what they were shown, and
            // the app-wide gate collects the newer one on first login.
            acknowledgedVersionIds: z.array(z.string()).optional(),
        }),
    )

    .handler(async function ({ params: { inviteId, form, acknowledgedVersionIds = [] }, db }) {
        const invite = await db
            .selectFrom('pendingUser')
            .selectAll('pendingUser')
            .where('id', '=', inviteId)
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
                // Clerk rejects weak/compromised passwords (and other invalid input) with a 422.
                // Surface the human-readable reason inline instead of the opaque "Unprocessable
                // Entity" toast. The signup form renders the `form` key as a dedicated alert and
                // uses `code` to pick an appropriate title (e.g. "Compromised Password").
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

            await trx
                .insertInto('orgUser')
                .values({
                    userId: user.id,
                    orgId: invite.orgId,
                    isAdmin: invite.isAdmin,
                })
                .returning('id')
                .executeTakeFirstOrThrow()

            await recordSignupAcknowledgements(trx, user.id, acknowledgedVersionIds)

            return user
        })

        await updateClerkUserMetadata(siUser.id)
        onUserAcceptInvite(siUser.id)

        return { userId: siUser.id }
    })
