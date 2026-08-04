import { describe, it, expect, vi, type Mock } from 'vitest'
import {
    db,
    insertTestOrg,
    insertTestUser,
    mockSessionWithTestData,
    readTestSupportFile,
    faker,
    qaEmail,
} from '@/tests/unit.helpers'
import { pemToArrayBuffer, fingerprintKeyData } from 'si-encryption/util'
import { QaCleanupNotFoundError } from '@/server/qa-cleanup'
import { updateClerkUserMetadata } from '@/server/clerk'
import { deliver } from '@/server/mailgun'
import { provisionQaUser, createQaInvite, QaConflictError, QaInvalidRequestError } from './qa-provision'

// Assert no invite email escapes: createQaInvite deliberately skips onUserInvited.
vi.mock('@/server/mailgun', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/mailgun')>()
    return { ...actual, deliver: vi.fn(async () => {}) }
})

const orgSlugsFor = async (userId: string) => {
    const rows = await db
        .selectFrom('orgUser')
        .innerJoin('org', 'org.id', 'orgUser.orgId')
        .select(['org.slug', 'orgUser.isAdmin'])
        .where('orgUser.userId', '=', userId)
        .orderBy('org.slug')
        .execute()
    return rows
}

describe('provisionQaUser', () => {
    it('sets exactly the listed orgs, removing ones not listed', async () => {
        const orgA = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const orgB = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org: orgA, email: qaEmail() })
        await db.insertInto('orgUser').values({ userId: user.id, orgId: orgB.id, isAdmin: false }).execute()

        const result = await provisionQaUser(db, user.id, { orgs: [{ slug: orgB.slug, isAdmin: true }] })

        expect(await orgSlugsFor(user.id)).toEqual([{ slug: orgB.slug, isAdmin: true }])
        expect(result.orgs).toEqual([{ slug: orgB.slug, isAdmin: true }])
    })

    it('flips isAdmin on an existing membership without duplicating the row', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, isAdmin: false, email: qaEmail() })

        await provisionQaUser(db, user.id, { orgs: [{ slug: org.slug, isAdmin: true }] })

        const rows = await db.selectFrom('orgUser').select(['id', 'isAdmin']).where('userId', '=', user.id).execute()
        expect(rows).toHaveLength(1)
        expect(rows[0].isAdmin).toBe(true)
    })

    it('removes every membership when given an empty orgs array', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: qaEmail() })

        await provisionQaUser(db, user.id, { orgs: [] })

        expect(await orgSlugsFor(user.id)).toHaveLength(0)
    })

    it('rejects an unknown slug without touching existing memberships', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: qaEmail() })

        await expect(provisionQaUser(db, user.id, { orgs: [{ slug: 'does-not-exist' }] })).rejects.toBeInstanceOf(
            QaCleanupNotFoundError,
        )

        expect(await orgSlugsFor(user.id)).toEqual([{ slug: org.slug, isAdmin: false }])
    })

    it('resolves the user by email', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: qaEmail() })

        const result = await provisionQaUser(db, user.email!.toUpperCase(), { orgs: [] })

        expect(result.userId).toBe(user.id)
    })

    it('stores a public key and derives its fingerprint', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org, email: qaEmail() })
        const pem = await readTestSupportFile('public_key.pem')

        const result = await provisionQaUser(db, user.id, { publicKey: pem })

        const expected = await fingerprintKeyData(pemToArrayBuffer(pem))
        expect(result.fingerprint).toBe(expected)

        const stored = await db
            .selectFrom('userPublicKey')
            .select(['fingerprint'])
            .where('userId', '=', user.id)
            .execute()
        expect(stored).toEqual([{ fingerprint: expected }])
    })

    it('replaces an existing key in place', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        // enclave users are seeded with a placeholder key by insertTestUser
        const { user } = await insertTestUser({ org, email: qaEmail() })
        const pem = await readTestSupportFile('public_key.pem')

        await provisionQaUser(db, user.id, { publicKey: pem })

        const rows = await db
            .selectFrom('userPublicKey')
            .select(['fingerprint'])
            .where('userId', '=', user.id)
            .execute()
        expect(rows).toHaveLength(1)
        expect(rows[0].fingerprint).toBe(await fingerprintKeyData(pemToArrayBuffer(pem)))
    })

    it('rejects a malformed public key', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org, email: qaEmail() })

        await expect(provisionQaUser(db, user.id, { publicKey: 'not-a-key' })).rejects.toThrow()

        const rows = await db.selectFrom('userPublicKey').select(['id']).where('userId', '=', user.id).execute()
        expect(rows).toHaveLength(0)
    })

    it('sets the Clerk password, skipping strength checks', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org, email: qaEmail() })
        const { client } = await mockSessionWithTestData({ isSiAdmin: true })
        if (!client) throw new Error('expected a mocked clerk client')

        const result = await provisionQaUser(db, user.id, { password: 'qa-test-1234' })

        expect(client.users.updateUser as Mock).toHaveBeenCalledWith(user.clerkId, {
            password: 'qa-test-1234',
            skipPasswordChecks: true,
        })
        expect(result.passwordSet).toBe(true)
    })

    // Authorization reads memberships from the Clerk JWT, not the DB, so a membership
    // change that skips this sync is invisible until the user signs in again.
    it('syncs Clerk metadata after an org change so authorization sees it', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org, email: qaEmail() })
        ;(updateClerkUserMetadata as Mock).mockClear()

        await provisionQaUser(db, user.id, { orgs: [{ slug: org.slug }] })

        expect(updateClerkUserMetadata as Mock).toHaveBeenCalledWith(user.id)
    })

    // A committed membership change plus a failed Clerk sync would leave the DB and the
    // JWT granting different access. The change is rolled back instead.
    it('restores the previous memberships when the Clerk metadata sync fails', async () => {
        const orgA = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const orgB = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org: orgA, isAdmin: true, email: qaEmail() })
        const before = await orgSlugsFor(user.id)
        ;(updateClerkUserMetadata as Mock).mockRejectedValueOnce(new Error('clerk is down'))

        await expect(provisionQaUser(db, user.id, { orgs: [{ slug: orgB.slug, isAdmin: true }] })).rejects.toThrow(
            'clerk is down',
        )

        expect(await orgSlugsFor(user.id)).toEqual(before)
    })

    it('does not resync Clerk metadata when orgs are untouched', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org, email: qaEmail() })
        ;(updateClerkUserMetadata as Mock).mockClear()

        await provisionQaUser(db, user.id, { publicKey: await readTestSupportFile('public_key.pem') })

        expect(updateClerkUserMetadata as Mock).not.toHaveBeenCalled()
    })

    it('leaves omitted fields untouched', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, isAdmin: true, email: qaEmail() })
        const { client } = await mockSessionWithTestData({ isSiAdmin: true })
        if (!client) throw new Error('expected a mocked clerk client')
        ;(client.users.updateUser as Mock).mockClear()

        const result = await provisionQaUser(db, user.id, {})

        expect(await orgSlugsFor(user.id)).toEqual([{ slug: org.slug, isAdmin: true }])
        expect(result.fingerprint).toBeNull()
        expect(result.passwordSet).toBe(false)
        expect(client.users.updateUser as Mock).not.toHaveBeenCalled()
    })

    it('throws for an unknown user', async () => {
        await expect(provisionQaUser(db, faker.string.uuid(), { orgs: [] })).rejects.toBeInstanceOf(
            QaCleanupNotFoundError,
        )
    })
})

describe('createQaInvite', () => {
    it('creates a pending invite and returns its url', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { client } = await mockSessionWithTestData({ isSiAdmin: true })
        if (!client) throw new Error('expected a mocked clerk client')
        // The default mock resolves a clerk user for any email; an invite is for someone
        // who is not yet a member, so return none.
        ;(client.users.getUserList as Mock).mockResolvedValue({ data: [], totalCount: 0 })

        const result = await createQaInvite(db, { email: 'QA-New@Test.com', orgSlug: org.slug, isAdmin: true }, null)

        expect(result.alreadyInvited).toBe(false)
        expect(result.email).toBe('qa-new@test.com')
        expect(result.inviteUrl).toContain(`/account/invitation/${result.inviteId}`)

        const pending = await db
            .selectFrom('pendingUser')
            .select(['email', 'isAdmin', 'orgId'])
            .where('id', '=', result.inviteId)
            .executeTakeFirstOrThrow()
        expect(pending).toEqual({ email: 'qa-new@test.com', isAdmin: true, orgId: org.id })
    })

    it('records the inviting admin', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org, email: qaEmail() })
        const { client } = await mockSessionWithTestData({ isSiAdmin: true })
        if (!client) throw new Error('expected a mocked clerk client')
        ;(client.users.getUserList as Mock).mockResolvedValue({ data: [], totalCount: 0 })

        const result = await createQaInvite(db, { email: qaEmail(), orgSlug: org.slug }, user.id)

        const pending = await db
            .selectFrom('pendingUser')
            .select(['invitedByUserId'])
            .where('id', '=', result.inviteId)
            .executeTakeFirstOrThrow()
        expect(pending.invitedByUserId).toBe(user.id)
    })

    it('reuses an outstanding invite instead of creating a second one', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { client } = await mockSessionWithTestData({ isSiAdmin: true })
        if (!client) throw new Error('expected a mocked clerk client')
        ;(client.users.getUserList as Mock).mockResolvedValue({ data: [], totalCount: 0 })
        const email = qaEmail()

        const first = await createQaInvite(db, { email, orgSlug: org.slug }, null)
        const second = await createQaInvite(db, { email, orgSlug: org.slug }, null)

        expect(second.inviteId).toBe(first.inviteId)
        expect(second.alreadyInvited).toBe(true)

        const all = await db
            .selectFrom('pendingUser')
            .select(['id'])
            .where('email', '=', email.toLowerCase())
            .where('orgId', '=', org.id)
            .execute()
        expect(all).toHaveLength(1)
    })

    it('rejects an email that already belongs to a member of the org', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org, email: qaEmail() })
        const { client } = await mockSessionWithTestData({ isSiAdmin: true })
        if (!client) throw new Error('expected a mocked clerk client')
        ;(client.users.getUserList as Mock).mockResolvedValue({
            data: [{ id: user.clerkId }],
            totalCount: 1,
        })

        await expect(createQaInvite(db, { email: user.email!, orgSlug: org.slug }, null)).rejects.toBeInstanceOf(
            QaConflictError,
        )
    })

    it('throws for an unknown org slug', async () => {
        await expect(createQaInvite(db, { email: qaEmail(), orgSlug: 'nope' }, null)).rejects.toBeInstanceOf(
            QaCleanupNotFoundError,
        )
    })

    it('sends no invitation email', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { client } = await mockSessionWithTestData({ isSiAdmin: true })
        if (!client) throw new Error('expected a mocked clerk client')
        ;(client.users.getUserList as Mock).mockResolvedValue({ data: [], totalCount: 0 })
        ;(deliver as Mock).mockClear()

        await createQaInvite(db, { email: qaEmail(), orgSlug: org.slug }, null)

        expect(deliver as Mock).not.toHaveBeenCalled()
    })
})

describe('QaInvalidRequestError', () => {
    it('is raised for a PEM that cannot be decoded', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org, email: qaEmail() })

        await expect(
            provisionQaUser(db, user.id, { publicKey: '-----BEGIN PUBLIC KEY-----\n!!!\n-----END PUBLIC KEY-----' }),
        ).rejects.toBeInstanceOf(QaInvalidRequestError)
    })

    // Decodes cleanly but is an EC key, not the RSA-OAEP key results are wrapped to.
    // Bad caller input, so it must not surface as a 500.
    it('is raised for a decodable PEM holding an unsupported key type', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org, email: qaEmail() })

        const { publicKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
        const spki = Buffer.from(await crypto.subtle.exportKey('spki', publicKey)).toString('base64')
        const pem = `-----BEGIN PUBLIC KEY-----\n${spki}\n-----END PUBLIC KEY-----`

        await expect(provisionQaUser(db, user.id, { publicKey: pem })).rejects.toBeInstanceOf(QaInvalidRequestError)
    })
})
