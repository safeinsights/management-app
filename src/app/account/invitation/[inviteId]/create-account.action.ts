'use server'

import type { DBExecutor } from '@/database'
import { enforcedLegalDocumentTypes } from '@/schema/legal-document'
import { Action, ActionFailure, z } from '@/server/actions/action'
import { updateClerkUserMetadata } from '@/server/clerk'
import { getUserPublicKey } from '@/server/db/queries'
import { onUserAcceptInvite, onUserLogIn } from '@/server/events'
import { extractClerkCodeAndMessage, isClerkApiError } from '@/lib/errors'
import { toRecord } from '@/lib/permissions'
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

// Invites are bearer credentials by design: holding the invite id is what authorizes acting on
// it, so `claim PendingUser` is unconditioned in permissions.ts. The `claimedByUserId` guard is
// what stops one user burning an invite somebody else already accepted; re-claiming by the same
// user is a no-op success because onCreateAccountAction claims in-transaction and this action
// runs again from the signup page after sign-in.
export const onPendingUserLoginAction = new Action('onPendingUserLoginAction')
    .params(z.object({ inviteId: z.string() }))
    .requireAbilityTo('claim', 'PendingUser')
    .handler(async ({ params: { inviteId }, session, db }) => {
        await db
            .updateTable('pendingUser')
            .set({ claimedByUserId: session.user.id })
            .where('id', '=', inviteId)
            .where((eb) => eb.or([eb('claimedByUserId', 'is', null), eb('claimedByUserId', '=', session.user.id)]))
            // returning() so an update that matched nothing yields no row and raises, rather than
            // an UpdateResult that looks like success regardless of how many rows were touched.
            .returning('id')
            .executeTakeFirstOrThrow(() => new ActionFailure({ invite: 'not found' }))

        // Signup skips the shared post-sign-in sequence (it lands on MFA enrolment), so record it here.
        onUserLogIn({ userId: session.user.id })
    })

// Deliberately callable without a session: the invite link is opened before the recipient has an
// account, and the signup page needs the org name and invited email to render. Exposure is limited
// by the query rather than by an ability rule — only an unclaimed invite resolves, so a link that
// has already been accepted stops disclosing the invitee's email and the inviting user's name.
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

// Two legitimate callers with different rights: an org admin revoking an invite, and the invitee
// declining it. Invites are bearer credentials — holding the id is the same credential that
// authorizes accepting one, and declining is strictly weaker, so possession authorizes declining
// an unclaimed invite. (The previous email-match check was weaker than it looked: Clerk reports
// unverified addresses, so anyone could add the invitee's address to their own account unverified
// and delete their invites.) Claimed invites are spent bearer tokens; only an org admin may still
// remove those rows.
export const onRevokeInviteAction = new Action('onRevokeInviteAction')
    .params(
        z.object({
            inviteId: z.string(),
        }),
    )
    .handler(async function ({ params: { inviteId }, db, session }) {
        // This action has no requireAbilityTo, so an unauthenticated caller still reaches the
        // handler with a null session; both branches below require an identity.
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

// Invites are bearer credentials by design: any authenticated user holding the link may accept it,
// and the membership attaches to the accepting session's account — a user opening an invite
// addressed to another email joins under their own identity. The invariant enforced here is no
// privilege escalation: the acting identity comes from the session, never from a parameter (the
// pre-fix version took a `loggedInEmail` param and granted membership to whichever account owned
// it, unauthenticated — OTTER-724 / MA-9), the granted role comes only from the invite row, and
// nothing writes or verifies email addresses on any Clerk account.
export const onJoinTeamAccountAction = new Action('onJoinTeamAccountAction')
    .params(
        z.object({
            inviteId: z.string(),
        }),
    )

    .handler(async function ({ params: { inviteId }, db, session }) {
        // Without requireAbilityTo the handler is reached with a null session, so require one here.
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
            // Claim first, atomically: `claimedByUserId is null` plus returning() makes concurrent
            // accepts race on this row — the loser matches nothing and fails here instead of
            // reporting success — and a failure below rolls the claim back with the membership.
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

            // Already a member: the invite is still consumed so it leaves pending lists, and its
            // role is honoured as a grant — an admin re-invite of an existing contributor is the
            // ordinary promote-by-invite path. Never a downgrade: a contributor invite to an
            // existing admin is not a demotion; role removal has its own admin-only flow.
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
            }),
            // The versions the form actually displayed, not "whatever is latest now". If a new
            // version is published between page load and submit we record what they were shown, and
            // the app-wide gate collects the newer one on first login.
            // Validated as uuids because a malformed one reaches Postgres as a 22P02 inside the
            // account-creation transaction, which by then has a Clerk user standing behind it.
            acknowledgedVersionIds: z.array(z.string().uuid()).optional(),
        }),
    )

    .handler(async function ({ params: { inviteId, form, acknowledgedVersionIds = [] }, db }) {
        // Unauthenticated by necessity — this is what creates the account the invite is for — so
        // the invite id is the only credential. A claimed invite is spent and must not create a
        // second account or re-grant membership.
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

            // isAdmin comes from the invite row alone; the caller-supplied form carries only
            // name and password, so it cannot influence the granted role.
            await trx
                .insertInto('orgUser')
                .values({
                    userId: user.id,
                    orgId: invite.orgId,
                    isAdmin: invite.isAdmin,
                })
                .returning('id')
                .executeTakeFirstOrThrow()

            // Claim in the same transaction as the membership grant so the claimed-invite guard is
            // self-enforcing, rather than relying on the signup page to call
            // onPendingUserLoginAction after sign-in (unchecked, and skipped if sign-in fails or
            // the tab closes). The unclaimed filter plus returning() also makes the claim atomic
            // against a concurrent redemption of the same invite.
            await trx
                .updateTable('pendingUser')
                .set({ claimedByUserId: user.id })
                .where('id', '=', inviteId)
                .where('claimedByUserId', 'is', null)
                .returning('id')
                .executeTakeFirstOrThrow(() => new ActionFailure({ invite: 'not found' }))

            await recordSignupAcknowledgements(trx, user.id, acknowledgedVersionIds)

            return user
        })

        await updateClerkUserMetadata(siUser.id)
        onUserAcceptInvite(siUser.id)

        return { userId: siUser.id }
    })
