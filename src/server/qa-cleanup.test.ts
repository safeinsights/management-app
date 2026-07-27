import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import {
    db,
    insertTestOrg,
    insertTestUser,
    insertTestStudyData,
    mockSessionWithTestData,
    faker,
    qaEmail,
} from '@/tests/unit.helpers'
import { verifyToken } from '@clerk/nextjs/server'
import { headers } from 'next/headers'
import { deleteFolderContents } from '@/server/aws'

// PROD_ENV is a module-level const, so override it via a mutable holder we can flip per test.
const configState = { PROD_ENV: false }
vi.mock('@/server/config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/config')>()
    return {
        ...actual,
        get PROD_ENV() {
            return configState.PROD_ENV
        },
    }
})

// S3 cleanup is exercised by study deletion; stub it so tests don't touch S3.
vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return { ...actual, deleteFolderContents: vi.fn(async () => {}) }
})

const { requireQaAdmin, deleteUserById, deleteStudyById, QaCleanupNotFoundError, QaForbiddenError, assertQaEmail } =
    await import('./qa-cleanup')

beforeEach(() => {
    configState.PROD_ENV = false
})

/**
 * The QA routes verify the SI admin's Clerk session token straight from the
 * Authorization header (clerkMiddleware doesn't run on /api/*), so authenticating
 * a test means setting that header and making `verifyToken` resolve to the same
 * claims `mockSessionWithTestData` wired into the session. Returns the mocked Clerk
 * client so callers can assert on it (e.g. deleteUser).
 */
async function authenticateAsSiAdmin(options: { isSiAdmin: boolean }) {
    const mocks = await mockSessionWithTestData({ isSiAdmin: options.isSiAdmin })
    if (!mocks.auth) throw new Error('expected a mocked clerk auth')
    const { userId, sessionClaims } = mocks.auth()
    ;(verifyToken as Mock).mockResolvedValue({ sub: userId, ...sessionClaims })
    ;(await headers()).set('Authorization', 'Bearer fake-clerk-session-token')
    return mocks
}

describe('requireQaAdmin', () => {
    // These routes intentionally run on production; the qa-email guard, not the
    // environment, is what keeps them off real accounts.
    it('allows an SI admin in production', async () => {
        configState.PROD_ENV = true
        await authenticateAsSiAdmin({ isSiAdmin: true })
        const result = await requireQaAdmin()
        expect(result.ok).toBe(true)
    })

    it('rejects when the Authorization header is missing', async () => {
        const result = await requireQaAdmin()
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.status).toBe(401)
    })

    it('rejects when the token fails verification', async () => {
        ;(verifyToken as Mock).mockRejectedValue(new Error('invalid token'))
        ;(await headers()).set('Authorization', 'Bearer bad-token')
        const result = await requireQaAdmin()
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.status).toBe(401)
    })

    it('rejects a non SI admin', async () => {
        await authenticateAsSiAdmin({ isSiAdmin: false })
        const result = await requireQaAdmin()
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.status).toBe(403)
    })

    // The authenticated admin is returned so callers can attribute what they create
    // (e.g. pendingUser.invited_by_user_id on a QA invite).
    it('allows an SI admin and returns them', async () => {
        const { user } = await authenticateAsSiAdmin({ isSiAdmin: true })
        const result = await requireQaAdmin()
        expect(result).toMatchObject({ ok: true, user: { id: user.id, isSiAdmin: true } })
    })

    // Regression guard for the empty-options bug: standalone verifyToken does not read
    // CLERK_SECRET_KEY from the env, so the guard must pass it explicitly or JWK resolution
    // fails and every request 401s. Assert the option is present (by key, not value — the key
    // is unset in the test env) so dropping it back to `{}` fails here.
    it('passes the Clerk secret key to verifyToken', async () => {
        await authenticateAsSiAdmin({ isSiAdmin: true })
        await requireQaAdmin()

        const [, options] = (verifyToken as Mock).mock.calls.at(-1) ?? []
        expect(Object.keys(options ?? {})).toContain('secretKey')
    })
})

// The QA routes run on production, so this check is the only thing keeping them off
// real accounts. Deletion is permanent (DB rows, S3 objects, Clerk account).
describe('assertQaEmail', () => {
    it.each(['qa-reviewer@test.com', 'QA-Test@example.org', 'qa-@test.com'])('accepts %s', (email) => {
        expect(() => assertQaEmail(email, 'user')).not.toThrow()
    })

    // The dash is what separates the QA convention from real given names.
    it.each([
        'qa@test.com',
        'qa.bob@test.com',
        'QATest@example.org',
        'qasim@example.org',
        'qadir@example.org',
        'bob-qa@test.com',
        'real.user@corp.com',
        'quality@test.com',
        'q@test.com',
        '',
    ])('rejects %s', (email) => {
        expect(() => assertQaEmail(email, 'user')).toThrow(QaForbiddenError)
    })

    it('rejects a null email', () => {
        expect(() => assertQaEmail(null, 'user')).toThrow(QaForbiddenError)
    })

    // "qa" must anchor the local part, not appear anywhere in the address.
    it('rejects an address whose domain merely contains qa', () => {
        expect(() => assertQaEmail('bob@qa.example.com', 'user')).toThrow(QaForbiddenError)
    })
})

describe('QA account guard', () => {
    it('refuses to delete a user whose email is not qa-prefixed', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: 'real.person@corp.com' })

        await expect(deleteUserById(db, user.id)).rejects.toBeInstanceOf(QaForbiddenError)

        const still = await db.selectFrom('user').select('id').where('id', '=', user.id).executeTakeFirst()
        expect(still).toBeDefined()
    })

    // Passing the internal id must not sidestep the check: it is applied to the
    // stored address, not to whatever the caller typed.
    it('refuses by stored email even when looked up by id', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: 'someone@corp.com' })

        await expect(deleteUserById(db, user.id)).rejects.toBeInstanceOf(QaForbiddenError)
    })

    it('refuses to delete a study owned by a non-qa researcher', async () => {
        const org = await insertTestOrg()
        const { user: researcher } = await insertTestUser({ org, email: 'professor@harvard.edu' })
        const { studyId } = await insertTestStudyData({ org, researcherId: researcher.id })

        await expect(deleteStudyById(db, studyId)).rejects.toBeInstanceOf(QaForbiddenError)

        const still = await db.selectFrom('study').select('id').where('id', '=', studyId).executeTakeFirst()
        expect(still).toBeDefined()
    })
})

describe('deleteStudyById', () => {
    it('deletes the study and its jobs', async () => {
        const org = await insertTestOrg()
        const { user: researcher } = await insertTestUser({ org, email: qaEmail() })
        const { studyId, jobIds } = await insertTestStudyData({ org, researcherId: researcher.id })

        await deleteStudyById(db, studyId)

        const study = await db.selectFrom('study').select('id').where('id', '=', studyId).executeTakeFirst()
        expect(study).toBeUndefined()

        const jobs = await db.selectFrom('studyJob').select('id').where('id', 'in', jobIds).execute()
        expect(jobs).toHaveLength(0)

        const statuses = await db.selectFrom('jobStatusChange').select('id').where('studyJobId', 'in', jobIds).execute()
        expect(statuses).toHaveLength(0)
    })

    it('commits the row deletes before S3 cleanup and propagates S3 failures', async () => {
        const org = await insertTestOrg()
        const { user: researcher } = await insertTestUser({ org, email: qaEmail() })
        const { studyId } = await insertTestStudyData({ org, researcherId: researcher.id })
        ;(deleteFolderContents as Mock).mockRejectedValueOnce(new Error('s3 unavailable'))

        await expect(deleteStudyById(db, studyId)).rejects.toThrow('s3 unavailable')

        const study = await db.selectFrom('study').select('id').where('id', '=', studyId).executeTakeFirst()
        expect(study).toBeUndefined()
    })

    it('throws for an unknown study', async () => {
        await expect(deleteStudyById(db, faker.string.uuid())).rejects.toBeInstanceOf(QaCleanupNotFoundError)
    })
})

describe('deleteUserById', () => {
    it('deletes the user, their studies, dependent rows, and the Clerk account', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: qaEmail() })
        // A study owned by this researcher must be removed before the user (FK has no cascade).
        const { studyId } = await insertTestStudyData({ org, researcherId: user.id })

        // Authenticate as an SI admin so the global Clerk client mock (with deleteUser) is wired up.
        const { client } = await mockSessionWithTestData({ isSiAdmin: true })
        if (!client) throw new Error('expected a mocked clerk client')

        await deleteUserById(db, user.id)

        const deleted = await db.selectFrom('user').select('id').where('id', '=', user.id).executeTakeFirst()
        expect(deleted).toBeUndefined()

        const study = await db.selectFrom('study').select('id').where('id', '=', studyId).executeTakeFirst()
        expect(study).toBeUndefined()

        const orgUsers = await db.selectFrom('orgUser').select('id').where('userId', '=', user.id).execute()
        expect(orgUsers).toHaveLength(0)

        const keys = await db.selectFrom('userPublicKey').select('id').where('userId', '=', user.id).execute()
        expect(keys).toHaveLength(0)

        expect(client.users.deleteUser as Mock).toHaveBeenCalledWith(user.clerkId)
    })

    // Deleting a QA account must never take a real researcher's study with it just
    // because the QA account was assigned to review it.
    it('detaches, rather than deletes, studies the user only reviews or is PI on', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user: realResearcher } = await insertTestUser({ org })
        const { user: qaUser } = await insertTestUser({ org, email: qaEmail() })
        const { studyId } = await insertTestStudyData({ org, researcherId: realResearcher.id })
        await db
            .updateTable('study')
            .set({ reviewerId: qaUser.id, piUserId: qaUser.id })
            .where('id', '=', studyId)
            .execute()

        await mockSessionWithTestData({ isSiAdmin: true })
        await deleteUserById(db, qaUser.id)

        const study = await db
            .selectFrom('study')
            .select(['id', 'researcherId', 'reviewerId', 'piUserId'])
            .where('id', '=', studyId)
            .executeTakeFirst()

        expect(study).toMatchObject({ researcherId: realResearcher.id, reviewerId: null, piUserId: null })
    })

    it('tolerates a Clerk 404 as an already-deleted account', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: qaEmail() })
        const { client } = await mockSessionWithTestData({ isSiAdmin: true })
        if (!client) throw new Error('expected a mocked clerk client')
        ;(client.users.deleteUser as Mock).mockRejectedValue({
            status: 404,
            errors: [{ code: 'resource_not_found', message: 'User not found' }],
        })

        await deleteUserById(db, user.id)

        const deleted = await db.selectFrom('user').select('id').where('id', '=', user.id).executeTakeFirst()
        expect(deleted).toBeUndefined()
    })

    it('propagates non-404 Clerk deletion failures after committing the DB deletes', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: qaEmail() })
        const { client } = await mockSessionWithTestData({ isSiAdmin: true })
        if (!client) throw new Error('expected a mocked clerk client')
        ;(client.users.deleteUser as Mock).mockRejectedValue(new Error('clerk is down'))

        await expect(deleteUserById(db, user.id)).rejects.toThrow('clerk is down')

        // Rows are deleted transactionally and committed before Clerk cleanup runs,
        // so the DB side is complete even though the endpoint reports the failure.
        const deleted = await db.selectFrom('user').select('id').where('id', '=', user.id).executeTakeFirst()
        expect(deleted).toBeUndefined()
    })

    it('throws for an unknown user', async () => {
        await expect(deleteUserById(db, faker.string.uuid())).rejects.toBeInstanceOf(QaCleanupNotFoundError)
    })

    // QA works from email addresses rather than internal ids.
    it('resolves the user by email, ignoring case', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: qaEmail() })
        const { client } = await mockSessionWithTestData({ isSiAdmin: true })
        if (!client) throw new Error('expected a mocked clerk client')

        await deleteUserById(db, user.email!.toUpperCase())

        const deleted = await db.selectFrom('user').select('id').where('id', '=', user.id).executeTakeFirst()
        expect(deleted).toBeUndefined()
    })

    it('throws for an unknown email', async () => {
        await expect(deleteUserById(db, 'nobody@example.com')).rejects.toBeInstanceOf(QaCleanupNotFoundError)
    })

    // A segment that is neither a uuid nor an email must 404 rather than making
    // Postgres raise on the uuid comparison.
    it('throws for a segment that is neither a uuid nor an email', async () => {
        await expect(deleteUserById(db, 'not-a-uuid')).rejects.toBeInstanceOf(QaCleanupNotFoundError)
    })
})
