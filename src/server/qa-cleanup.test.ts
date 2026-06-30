import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import {
    db,
    insertTestOrg,
    insertTestUser,
    insertTestStudyData,
    mockSessionWithTestData,
    faker,
} from '@/tests/unit.helpers'
import { verifyToken } from '@clerk/nextjs/server'
import { headers } from 'next/headers'

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

const { requireQaAdmin, deleteUserById, deleteStudyById, QaCleanupNotFoundError } = await import('./qa-cleanup')

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
    it('rejects in production', async () => {
        configState.PROD_ENV = true
        await authenticateAsSiAdmin({ isSiAdmin: true })
        const result = await requireQaAdmin()
        expect(result).toEqual({ ok: false, status: 403, message: expect.stringContaining('production') })
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

    it('allows an SI admin', async () => {
        await authenticateAsSiAdmin({ isSiAdmin: true })
        const result = await requireQaAdmin()
        expect(result).toEqual({ ok: true })
    })
})

describe('deleteStudyById', () => {
    it('deletes the study and its jobs', async () => {
        const org = await insertTestOrg()
        const { studyId, jobIds } = await insertTestStudyData({ org })

        await deleteStudyById(db, studyId)

        const study = await db.selectFrom('study').select('id').where('id', '=', studyId).executeTakeFirst()
        expect(study).toBeUndefined()

        const jobs = await db.selectFrom('studyJob').select('id').where('id', 'in', jobIds).execute()
        expect(jobs).toHaveLength(0)

        const statuses = await db.selectFrom('jobStatusChange').select('id').where('studyJobId', 'in', jobIds).execute()
        expect(statuses).toHaveLength(0)
    })

    it('throws for an unknown study', async () => {
        await expect(deleteStudyById(db, faker.string.uuid())).rejects.toBeInstanceOf(QaCleanupNotFoundError)
    })
})

describe('deleteUserById', () => {
    it('deletes the user, their studies, dependent rows, and the Clerk account', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org })
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

    it('throws for an unknown user', async () => {
        await expect(deleteUserById(db, faker.string.uuid())).rejects.toBeInstanceOf(QaCleanupNotFoundError)
    })
})
