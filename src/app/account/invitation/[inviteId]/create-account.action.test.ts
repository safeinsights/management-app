import { db } from '@/database'
import { actionResult, faker, insertTestOrg, insertTestUser, mockSessionWithTestData } from '@/tests/unit.helpers'
import { auth as clerkAuth, clerkClient } from '@clerk/nextjs/server'
import { v7 } from 'uuid'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
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
            // Merge path adds the invite email to the existing Clerk account and auto-verifies it.
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
            confirmPassword: 'password',
        }

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: faker.internet.email({ provider: 'test.com' }),
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        await onCreateAccountAction({ inviteId: invite.id, form })

        const newUser = await db.selectFrom('user').where('email', '=', invite.email).executeTakeFirst()
        expect(newUser).toBeDefined()
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
            confirmPassword: 'password',
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
                email: faker.internet.email({ provider: 'test.com' }),
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const form = {
            firstName: 'Test',
            lastName: 'User',
            password: 'hunter2',
            confirmPassword: 'hunter2',
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
            confirmPassword: 'password',
        }
        const result = await onCreateAccountAction({ inviteId: invite.id, form })
        expect(result).toEqual({ error: expect.objectContaining({ user: 'already has account' }) })
    })

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

        const result = actionResult(await onJoinTeamAccountAction({ inviteId: invite.id }))
        expect(result.needsUserKey).toBe(true)
    })

    it('onJoinTeamAccountAction merges a second email into a key-holding account without re-prompting', async () => {
        // Existing enclave-org account already holds a key. It accepts an invite addressed to a
        // DIFFERENT email (the merge case) while logged in under its own email.
        const { user } = await insertTestUser({ org })
        const newOrg = await insertTestOrg({ slug: faker.string.alpha(10) })

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: newOrg.id,
                email: faker.internet.email({ provider: 'test.com' }),
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const result = actionResult(await onJoinTeamAccountAction({ inviteId: invite.id, loggedInEmail: user.email! }))

        // Same account (not the invite email), and the combined key status suppresses the prompt.
        expect(result.id).toEqual(user.id)
        expect(result.needsUserKey).toBe(false)
    })

    it('onJoinTeamAccountAction merging into a keyless account reflects combined status and prompts once', async () => {
        // Account seeded via a lab org → keyless. Merging a second email must re-evaluate key status
        // at the account level immediately (no re-login) and still prompt for a key.
        const labOrg = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org: labOrg })
        const newOrg = await insertTestOrg({ slug: faker.string.alpha(10) })

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: newOrg.id,
                email: faker.internet.email({ provider: 'test.com' }),
                isAdmin: false,
                invitedByUserId: invitingUser.user.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow()

        const result = actionResult(await onJoinTeamAccountAction({ inviteId: invite.id, loggedInEmail: user.email! }))

        expect(result.id).toEqual(user.id)
        expect(result.needsUserKey).toBe(true)
    })

    it('onRevokeInviteAction removes invite', async () => {
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

        await onRevokeInviteAction({ inviteId: invite.id })

        const found = await db.selectFrom('pendingUser').select(['id']).where('id', '=', invite.id).executeTakeFirst()
        expect(found).toBeFalsy()
    })

    it('onPendingUserLoginAction claims invite for logged in user', async () => {
        const { user } = await mockSessionWithTestData({ orgSlug: org.slug })

        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: faker.internet.email({ provider: 'test.com' }),
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

    it('getOrgInfoForInviteAction returns org information for valid invite', async () => {
        const invite = await db
            .insertInto('pendingUser')
            .values({
                orgId: org.id,
                email: faker.internet.email({ provider: 'test.com' }),
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
})
