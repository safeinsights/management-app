import { db } from '@/database'
import {
    actionResult,
    faker,
    insertTestOrg,
    insertTestUser,
    mockClerkSession,
    mockSessionWithTestData,
    testEmail,
} from '@/tests/unit.helpers'
import { auth as clerkAuth, clerkClient } from '@clerk/nextjs/server'
import { v7 } from 'uuid'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import logger from '@/lib/logger'
import {
    getOrgInfoForInviteAction,
    onCreateAccountAction,
    onJoinTeamAccountAction,
    onPendingUserLoginAction,
    onRevokeInviteAction,
} from './create-account.action'

vi.mock('@/server/events')

describe('Create Account Actions', () => {
    let org: { id: string; slug: string; name: string; type: 'enclave' | 'lab' } = {
        id: '',
        slug: '',
        name: '',
        type: 'enclave',
    }
    let invitingUser: { user: { id: string } }

    beforeEach(async () => {
        org = await insertTestOrg()
        invitingUser = await insertTestUser({ org })
        const client = clerkClient as unknown as Mock
        const auth = clerkAuth as unknown as Mock
        auth.mockResolvedValue({
            userId: null,
            sessionClaims: null,
        })

        client.mockResolvedValue({
            users: {
                createUser: vi.fn(),
                updateUser: vi.fn(async () => ({})),
                updateUserMetadata: vi.fn(async () => ({})),
                getUser: vi.fn(() => ({ publicMetadata: {} })),
                getUserList: vi.fn(async () => ({
                    totalCount: 1,
                    data: [
                        {
                            id: faker.string.alpha(10),
                        },
                    ],
                })),
            },
            // Only the signup path touches these, to verify the address on a Clerk account it
            // just created for the invitee.
            emailAddresses: {
                createEmailAddress: vi.fn(async () => ({ id: faker.string.alpha(10) })),
                updateEmailAddress: vi.fn(async () => ({})),
            },
        })
    })

    it('onCreateAccountAction creates a new user', async () => {
        const form = {
            firstName: 'Test',
            lastName: 'User',
            password: 'password',
        }

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: testEmail(),
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        await onCreateAccountAction({ inviteId: invite.id, form })

        const newUser = await db
            .selectFrom('user')
            .select(['id', 'email'])
            .where('email', '=', invite.email)
            .executeTakeFirstOrThrow()

        // The membership grant and the claim commit together, so the claimed-invite guard is
        // self-enforcing rather than depending on a later client-side call.
        const claimed = await db
            .selectFrom('pendingUser')
            .select(['claimedByUserId'])
            .where('id', '=', invite.id)
            .executeTakeFirstOrThrow()
        expect(claimed.claimedByUserId).toBe(newUser.id)

        const membership = await db
            .selectFrom('orgUser')
            .select(['isAdmin'])
            .where('userId', '=', newUser.id)
            .where('orgId', '=', org.id)
            .executeTakeFirstOrThrow()
        expect(membership.isAdmin).toBe(false)
    })

    // The signup checkbox has never been persisted, so a user affirmatively agreed with no evidence
    // recorded. These two cover the fix and the state the app is in before anything is published.
    describe('signup acknowledgements', () => {
        const form = { firstName: 'Test', lastName: 'User', password: 'password', confirmPassword: 'password' }

        const createInvite = async () =>
            await db
                .insertInto('pendingUser')
                .values({
                    orgId: org.id,
                    email: faker.internet.email({ provider: 'test.com' }),
                    isAdmin: false,
                    invitedByUserId: invitingUser.user.id,
                })
                .returningAll()
                .executeTakeFirstOrThrow()

        const publishTos = async () => {
            const document = await db
                .insertInto('legalDocument')
                .values({ type: 'tos', orgId: null, studyId: null })
                .onConflict((oc) => oc.constraint('legal_document_scope_unique').doNothing())
                .returning('id')
                .executeTakeFirstOrThrow()

            return await db
                .insertInto('legalDocumentVersion')
                .values({
                    legalDocumentId: document.id,
                    filePath: 'legal/tos/terms.md',
                    format: 'markdown',
                    versionNumber: 1,
                    publishedAt: new Date(),
                    publishedBy: invitingUser.user.id,
                })
                .returning('id')
                .executeTakeFirstOrThrow()
        }

        const acknowledgementsFor = async (email: string) =>
            await db
                .selectFrom('legalDocumentAcknowledgement')
                .innerJoin('user', 'user.id', 'legalDocumentAcknowledgement.userId')
                .select('legalDocumentAcknowledgement.legalDocumentVersionId')
                .where('user.email', '=', email)
                .execute()

        it('records agreement to the versions the form displayed', async () => {
            const version = await publishTos()
            const invite = await createInvite()

            await onCreateAccountAction({ inviteId: invite.id, form, acknowledgedVersionIds: [version.id] })

            expect(await acknowledgementsFor(invite.email)).toEqual([{ legalDocumentVersionId: version.id }])
        })

        // A draft was never shown to anyone, so agreeing to one would be evidence of nothing. The
        // account is still created — the app-wide gate collects a real acknowledgement later.
        it('ignores a version that was never published', async () => {
            const document = await db
                .insertInto('legalDocument')
                .values({ type: 'tos', orgId: null, studyId: null })
                .onConflict((oc) => oc.constraint('legal_document_scope_unique').doNothing())
                .returning('id')
                .executeTakeFirstOrThrow()
            const draft = await db
                .insertInto('legalDocumentVersion')
                .values({ legalDocumentId: document.id, filePath: 'legal/tos/draft.md', format: 'markdown' })
                .returning('id')
                .executeTakeFirstOrThrow()
            const invite = await createInvite()

            await onCreateAccountAction({ inviteId: invite.id, form, acknowledgedVersionIds: [draft.id] })

            expect(await db.selectFrom('user').where('email', '=', invite.email).executeTakeFirst()).toBeDefined()
            expect(await acknowledgementsFor(invite.email)).toEqual([])
        })

        it('creates the account when nothing has been published to acknowledge', async () => {
            const invite = await createInvite()

            await onCreateAccountAction({ inviteId: invite.id, form })

            expect(await db.selectFrom('user').where('email', '=', invite.email).executeTakeFirst()).toBeDefined()
            expect(await acknowledgementsFor(invite.email)).toEqual([])
        })
    })

    it('onCreateAccountAction throws an error if invite not found', async () => {
        const form = {
            firstName: 'Test',
            lastName: 'User',
            password: 'password',
        }

        const result = await onCreateAccountAction({ inviteId: v7(), form })
        expect(result).toEqual({ error: expect.objectContaining({ invite: 'not found' }) })
    })

    it('onCreateAccountAction surfaces Clerk validation errors inline', async () => {
        const client = clerkClient as unknown as Mock
        client.mockResolvedValue({
            users: {
                // no existing Clerk user, so the handler attempts to create one
                getUserList: vi.fn(async () => ({ totalCount: 0, data: [] })),
                createUser: vi.fn(async () => {
                    throw {
                        errors: [
                            {
                                code: 'form_password_pwned',
                                message: 'Password has been found in an online data breach.',
                                longMessage:
                                    'Password has been found in an online data breach. For account safety, please use a different password.',
                            },
                        ],
                    }
                }),
            },
        })

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: testEmail(),
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const form = {
            firstName: 'Test',
            lastName: 'User',
            password: 'hunter2',
        }

        const result = await onCreateAccountAction({ inviteId: invite.id, form })
        expect(result).toEqual({
            error: {
                code: 'form_password_pwned',
                form: 'Password has been found in an online data breach. For account safety, please use a different password.',
            },
        })
    })

    it('onCreateAccountAction rejects existing user', async () => {
        const { user } = await insertTestUser({ org })

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: user.email!,
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const form = {
            firstName: 'Test',
            lastName: 'User',
            password: 'password',
        }
        const result = await onCreateAccountAction({ inviteId: invite.id, form })
        expect(result).toEqual({ error: expect.objectContaining({ user: 'already has account' }) })
    })

    // Signs in the given DB user. Invites are bearer credentials, so acceptance authorizes on
    // the session alone — no Clerk email mocking is involved.
    const signInAs = (user: { id: string; clerkId: string; email: string | null }, orgSlug: string) =>
        // Non-null: mockClerkSession only returns undefined for a null (signed-out) argument.
        mockClerkSession({
            userId: user.id,
            clerkUserId: user.clerkId,
            email: user.email ?? undefined,
            orgSlug,
        })!

    it('onJoinTeamAccountAction adds to existing user', async () => {
        const { user } = await insertTestUser({ org })

        const newOrg = await insertTestOrg()

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: newOrg.id,
                email: user.email!,
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        signInAs(user, org.slug)

        const result = actionResult(await onJoinTeamAccountAction({ inviteId: invite.id }))
        const userId = result.id
        expect(userId).toEqual(user.id)
        const orgUsers = await db.selectFrom('orgUser').select('orgId').where('userId', '=', userId).execute()
        expect(orgUsers).toHaveLength(2)
        expect(orgUsers).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ orgId: org.id }),
                expect.objectContaining({ orgId: newOrg.id }),
            ]),
        )

        const claimed = await db
            .selectFrom('pendingUser')
            .select(['claimedByUserId'])
            .where('id', '=', invite.id)
            .executeTakeFirstOrThrow()
        expect(claimed.claimedByUserId).toBe(user.id)
    })

    it('onJoinTeamAccountAction attaches an invite addressed to another email to the accepting account', async () => {
        // Invites are bearer credentials: whoever holds the link may accept, and the membership
        // attaches to the accepting session's account — never to the invited address's account.
        const { user } = await insertTestUser({ org })
        const targetOrg = await insertTestOrg({ slug: faker.string.alpha(10) })

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: targetOrg.id,
                email: testEmail(),
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const mocks = signInAs(user, org.slug)
        // Accepting must never write the invited address onto the accepting Clerk account: a
        // verified address is a sign-in / password-reset identifier (the old takeover primitive).
        const emailWrites = { createEmailAddress: vi.fn(), updateEmailAddress: vi.fn() }
        Object.assign(mocks.client, { emailAddresses: emailWrites })

        const result = actionResult(await onJoinTeamAccountAction({ inviteId: invite.id }))
        expect(result.id).toEqual(user.id)

        const membership = await db
            .selectFrom('orgUser')
            .select(['userId', 'isAdmin'])
            .where('orgId', '=', targetOrg.id)
            .execute()
        expect(membership).toEqual([{ userId: user.id, isAdmin: false }])

        const claimed = await db
            .selectFrom('pendingUser')
            .select(['claimedByUserId'])
            .where('id', '=', invite.id)
            .executeTakeFirstOrThrow()
        expect(claimed.claimedByUserId).toBe(user.id)

        expect(emailWrites.createEmailAddress).not.toHaveBeenCalled()
        expect(emailWrites.updateEmailAddress).not.toHaveBeenCalled()
    })

    it('onJoinTeamAccountAction grants exactly the role the invite row specifies', async () => {
        // The no-escalation invariant: a non-admin invite can never yield an admin membership,
        // and there is no caller-supplied input that can influence the granted role.
        const { user } = await insertTestUser({ org })
        const contributorOrg = await insertTestOrg({ slug: faker.string.alpha(10) })
        const adminOrg = await insertTestOrg({ slug: faker.string.alpha(10) })

        const contributorInvite = await db
            .insertInto('pendingUser')
            .values({
                orgId: contributorOrg.id,
                email: testEmail(),
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const adminInvite = await db
            .insertInto('pendingUser')
            .values({
                orgId: adminOrg.id,
                email: testEmail(),
                isAdmin: true,
                invitedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        signInAs(user, org.slug)

        // An injected isAdmin param is stripped by the schema, never honoured.
        actionResult(
            await onJoinTeamAccountAction({ inviteId: contributorInvite.id, isAdmin: true } as {
                inviteId: string
            }),
        )
        actionResult(await onJoinTeamAccountAction({ inviteId: adminInvite.id }))

        const memberships = await db
            .selectFrom('orgUser')
            .select(['orgId', 'isAdmin'])
            .where('userId', '=', user.id)
            .execute()
        expect(memberships).toEqual(
            expect.arrayContaining([
                { orgId: contributorOrg.id, isAdmin: false },
                { orgId: adminOrg.id, isAdmin: true },
            ]),
        )
    })

    it('onJoinTeamAccountAction promotes an existing member when the invite grants admin', async () => {
        // Re-inviting an existing contributor as admin is the ordinary promote-by-invite path;
        // consuming the invite without honouring its role would silently drop the promotion.
        const { user } = await insertTestUser({ org })

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: user.email!,
                isAdmin: true,
                invitedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        signInAs(user, org.slug)

        actionResult(await onJoinTeamAccountAction({ inviteId: invite.id }))

        const membership = await db
            .selectFrom('orgUser')
            .select(['isAdmin'])
            .where('orgId', '=', org.id)
            .where('userId', '=', user.id)
            .executeTakeFirstOrThrow()
        expect(membership.isAdmin).toBe(true)

        const claimed = await db
            .selectFrom('pendingUser')
            .select(['claimedByUserId'])
            .where('id', '=', invite.id)
            .executeTakeFirstOrThrow()
        expect(claimed.claimedByUserId).toBe(user.id)
    })

    it('onJoinTeamAccountAction never demotes an existing admin via a contributor invite', async () => {
        const { user } = await insertTestUser({ org, isAdmin: true })

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: user.email!,
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        signInAs(user, org.slug)

        actionResult(await onJoinTeamAccountAction({ inviteId: invite.id }))

        const membership = await db
            .selectFrom('orgUser')
            .select(['isAdmin'])
            .where('orgId', '=', org.id)
            .where('userId', '=', user.id)
            .executeTakeFirstOrThrow()
        expect(membership.isAdmin).toBe(true)
    })

    it('onJoinTeamAccountAction refuses an unauthenticated caller', async () => {
        const { user } = await insertTestUser({ org })
        const newOrg = await insertTestOrg({ slug: faker.string.alpha(10) })

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: newOrg.id,
                email: user.email!,
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const result = await onJoinTeamAccountAction({ inviteId: invite.id })

        expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
        const orgUsers = await db.selectFrom('orgUser').select('orgId').where('userId', '=', user.id).execute()
        expect(orgUsers).toEqual([expect.objectContaining({ orgId: org.id })])
    })

    it('onJoinTeamAccountAction refuses an already-claimed invite', async () => {
        const { user } = await insertTestUser({ org })
        const newOrg = await insertTestOrg({ slug: faker.string.alpha(10) })

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: newOrg.id,
                email: user.email!,
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
                claimedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        signInAs(user, org.slug)

        const result = await onJoinTeamAccountAction({ inviteId: invite.id })

        expect(result).toEqual({ error: expect.objectContaining({ invite: 'not found' }) })
        const orgUsers = await db.selectFrom('orgUser').select('orgId').where('userId', '=', user.id).execute()
        expect(orgUsers).toEqual([expect.objectContaining({ orgId: org.id })])
    })

    it('onJoinTeamAccountAction returns needsUserKey true for enclave org without existing key', async () => {
        const labOrg = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org: labOrg })

        const enclaveOrg = await insertTestOrg({ slug: faker.string.alpha(10) })

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: enclaveOrg.id,
                email: user.email!,
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        signInAs(user, labOrg.slug)

        const result = actionResult(await onJoinTeamAccountAction({ inviteId: invite.id }))
        expect(result.needsUserKey).toBe(true)
    })

    it('onJoinTeamAccountAction returns needsUserKey false for enclave org with existing key', async () => {
        const { user } = await insertTestUser({ org })

        const enclaveOrg = await insertTestOrg({ slug: faker.string.alpha(10) })

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: enclaveOrg.id,
                email: user.email!,
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        signInAs(user, org.slug)

        const result = actionResult(await onJoinTeamAccountAction({ inviteId: invite.id }))
        expect(result.needsUserKey).toBe(false)
    })

    it('onJoinTeamAccountAction returns needsUserKey true for lab org without existing key', async () => {
        // insertTestUser only auto-creates a key for enclave-org users, so seed this user in a
        // lab org to keep them key-less and exercise the lab researcher gate.
        const existingLabOrg = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org: existingLabOrg })

        const labOrg = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: labOrg.id,
                email: user.email!,
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        signInAs(user, existingLabOrg.slug)

        const result = actionResult(await onJoinTeamAccountAction({ inviteId: invite.id }))
        expect(result.needsUserKey).toBe(true)
    })

    const insertInvite = async (opts: { orgId?: string; email?: string; claimedByUserId?: string } = {}) =>
        await db
            .insertInto('pendingUser')
            .values({
                orgId: opts.orgId ?? org.id,
                email: opts.email ?? testEmail().toLowerCase(),
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
                claimedByUserId: opts.claimedByUserId ?? null,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

    const findInvite = async (id: string) =>
        await db.selectFrom('pendingUser').select(['id']).where('id', '=', id).executeTakeFirst()

    it('onRevokeInviteAction lets an org admin revoke an invite', async () => {
        await mockSessionWithTestData({ orgSlug: org.slug, isAdmin: true })

        const invite = await insertInvite()

        await onRevokeInviteAction({ inviteId: invite.id })

        expect(await findInvite(invite.id)).toBeFalsy()
    })

    it('onRevokeInviteAction lets any authenticated holder of the link decline an unclaimed invite', async () => {
        // Bearer design: possession of the invite id is the same credential that authorizes
        // accepting the invite, so it also authorizes declining it — no email match involved.
        await mockSessionWithTestData({ orgSlug: org.slug, isAdmin: false })

        const invite = await insertInvite()

        await onRevokeInviteAction({ inviteId: invite.id })

        expect(await findInvite(invite.id)).toBeFalsy()
    })

    it('onRevokeInviteAction refuses an unauthenticated caller', async () => {
        vi.spyOn(logger, 'error').mockImplementation(() => undefined)

        const invite = await insertInvite()

        const result = await onRevokeInviteAction({ inviteId: invite.id })

        expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
        expect(await findInvite(invite.id)).toBeTruthy()
    })

    it('onRevokeInviteAction lets an org admin remove a claimed invite', async () => {
        const { user } = await mockSessionWithTestData({ orgSlug: org.slug, isAdmin: true })

        const invite = await insertInvite({ claimedByUserId: user.id })

        await onRevokeInviteAction({ inviteId: invite.id })

        expect(await findInvite(invite.id)).toBeFalsy()
    })

    it('onRevokeInviteAction refuses a non-admin deleting a claimed invite', async () => {
        // A claimed invite is a spent bearer token: possession of the id no longer authorizes
        // anything, so only an org admin may remove the row.
        vi.spyOn(logger, 'error').mockImplementation(() => undefined)
        await mockSessionWithTestData({ orgSlug: org.slug, isAdmin: false })

        const invite = await insertInvite({ claimedByUserId: invitingUser.user.id })

        const result = await onRevokeInviteAction({ inviteId: invite.id })

        expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
        expect(await findInvite(invite.id)).toBeTruthy()
    })

    it('onRevokeInviteAction refuses an admin of a different org deleting a claimed invite', async () => {
        vi.spyOn(logger, 'error').mockImplementation(() => undefined)
        await mockSessionWithTestData({ isAdmin: true })

        // Invite belongs to `org`, which the caller does not administer.
        const invite = await insertInvite({ claimedByUserId: invitingUser.user.id })

        const result = await onRevokeInviteAction({ inviteId: invite.id })

        expect(result).toEqual({ error: expect.objectContaining({ permission_denied: expect.any(String) }) })
        expect(await findInvite(invite.id)).toBeTruthy()
    })

    it('onPendingUserLoginAction claims invite for logged in user', async () => {
        const { user } = await mockSessionWithTestData({ orgSlug: org.slug })

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: testEmail(),
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        await onPendingUserLoginAction({ inviteId: invite.id })

        const updatedInvite = await db
            .selectFrom('pendingUser')
            .select(['claimedByUserId'])
            .where('id', '=', invite.id)
            .executeTakeFirst()

        expect(updatedInvite?.claimedByUserId).toBe(user.id)
    })

    it('onPendingUserLoginAction is a no-op success when the same user already claimed the invite', async () => {
        // The signup page calls this after sign-in, by which point onCreateAccountAction has
        // already claimed the invite for the same user in-transaction.
        const { user } = await mockSessionWithTestData({ orgSlug: org.slug })

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: testEmail(),
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
                claimedByUserId: user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const result = await onPendingUserLoginAction({ inviteId: invite.id })
        expect(result).toBeUndefined()

        const unchanged = await db
            .selectFrom('pendingUser')
            .select(['claimedByUserId'])
            .where('id', '=', invite.id)
            .executeTakeFirstOrThrow()
        expect(unchanged.claimedByUserId).toBe(user.id)
    })

    it('onPendingUserLoginAction cannot re-claim an invite another user already claimed', async () => {
        await mockSessionWithTestData({ orgSlug: org.slug })

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: testEmail(),
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
                claimedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const result = await onPendingUserLoginAction({ inviteId: invite.id })

        expect(result).toEqual({ error: expect.objectContaining({ invite: 'not found' }) })

        const unchanged = await db
            .selectFrom('pendingUser')
            .select(['claimedByUserId'])
            .where('id', '=', invite.id)
            .executeTakeFirstOrThrow()
        expect(unchanged.claimedByUserId).toBe(invitingUser.user.id)
    })

    it('getOrgInfoForInviteAction returns org information for valid invite', async () => {
        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: testEmail(),
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const result = actionResult(await getOrgInfoForInviteAction({ inviteId: invite.id }))

        expect(result).toMatchObject({
            id: org.id,
            name: org.name,
            slug: org.slug,
            email: invite.email,
        })
    })

    it('getOrgInfoForInviteAction throws error for invalid invite', async () => {
        const result = await getOrgInfoForInviteAction({ inviteId: v7() })
        expect(result).toEqual({ error: expect.stringContaining('no result') })
    })

    it('getOrgInfoForInviteAction discloses nothing for an already-claimed invite', async () => {
        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: testEmail(),
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
                claimedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const result = await getOrgInfoForInviteAction({ inviteId: invite.id })
        expect(result).toEqual({ error: expect.stringContaining('no result') })
    })

    it('onCreateAccountAction refuses an already-claimed invite', async () => {
        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: testEmail(),
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
                claimedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const result = await onCreateAccountAction({
            inviteId: invite.id,
            form: { firstName: 'Test', lastName: 'User', password: 'password' },
        })

        expect(result).toEqual({ error: expect.objectContaining({ invite: 'not found' }) })
        const created = await db.selectFrom('user').where('email', '=', invite.email).executeTakeFirst()
        expect(created).toBeUndefined()
    })
})
