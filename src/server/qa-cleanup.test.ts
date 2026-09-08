import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { sql } from 'kysely'
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

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return { ...actual, deleteFolderContents: vi.fn(async () => {}) }
})

const { requireQaAdmin, deleteUserById, deleteStudyById, QaCleanupNotFoundError, QaForbiddenError, assertQaEmail } =
    await import('./qa-cleanup')

beforeEach(() => {
    configState.PROD_ENV = false
})

async function authenticateAsSiAdmin(options: { isSiAdmin: boolean }) {
    const mocks = await mockSessionWithTestData({ isSiAdmin: options.isSiAdmin })
    if (!mocks.auth) throw new Error('expected a mocked clerk auth')
    const { userId, sessionClaims } = mocks.auth()
    ;(verifyToken as Mock).mockResolvedValue({ sub: userId, ...sessionClaims })
    ;(await headers()).set('Authorization', 'Bearer fake-clerk-session-token')
    return mocks
}

describe('requireQaAdmin', () => {
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

    it('allows an SI admin and returns them', async () => {
        const { user } = await authenticateAsSiAdmin({ isSiAdmin: true })
        const result = await requireQaAdmin()
        expect(result).toMatchObject({ ok: true, user: { id: user.id, isSiAdmin: true } })
    })

    // Standalone verifyToken does not read CLERK_SECRET_KEY from the env, so the guard must pass
    // it explicitly. Asserted by key, not value: the key is unset in the test env.
    it('passes the Clerk secret key to verifyToken', async () => {
        await authenticateAsSiAdmin({ isSiAdmin: true })
        await requireQaAdmin()

        const [, options] = (verifyToken as Mock).mock.calls.at(-1) ?? []
        expect(Object.keys(options ?? {})).toContain('secretKey')
    })
})

// The QA routes run on production, so this check is the only thing keeping them off real accounts.
describe('assertQaEmail', () => {
    it.each(['qa-reviewer@test.com', 'QA-Test@example.org', 'qa-@test.com'])('accepts %s', (email) => {
        expect(() => assertQaEmail(email, 'user')).not.toThrow()
    })

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
        const { studyId } = await insertTestStudyData({ org, researcherId: user.id })

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

        const deleted = await db.selectFrom('user').select('id').where('id', '=', user.id).executeTakeFirst()
        expect(deleted).toBeUndefined()
    })

    it('throws for an unknown user', async () => {
        await expect(deleteUserById(db, faker.string.uuid())).rejects.toBeInstanceOf(QaCleanupNotFoundError)
    })

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

    // Must 404 rather than making Postgres raise on the uuid comparison.
    it('throws for a segment that is neither a uuid nor an email', async () => {
        await expect(deleteUserById(db, 'not-a-uuid')).rejects.toBeInstanceOf(QaCleanupNotFoundError)
    })
})

/**
 * deleteUserById clears its FK references from a hand-maintained list, so a new table
 * referencing user.id without a cascade breaks deletion at runtime — an FK violation the
 * route surfaces as an opaque 500. That is exactly how the legal_document_acknowledgement
 * case shipped: every fully-signed-up QA account became undeletable, and no test noticed
 * because they all build their target with insertTestUser, which creates none of these rows.
 *
 * So this asserts the property rather than any one table: every FK to user.id must either
 * be handled by the database (CASCADE/SET NULL) or appear below. Adding a relation without
 * doing one of those fails here, at the point of the change, instead of on QA weeks later.
 */
describe('deleteUserById FK coverage', () => {
    // Each entry is a reference deleteUserById clears itself, with how it does so. Keeping the
    // reason here (rather than a bare name list) makes the intended handling reviewable when a
    // row is added — "detached" must stay correct for references that can belong to a real user.
    const HANDLED: Record<string, string> = {
        'job_status_change.user_id': 'deleted',
        'legal_document_acknowledgement.user_id': 'deleted',
        'org_user.user_id': 'deleted',
        'study.researcher_id': 'owned studies are deleted outright',
        'study.pi_user_id': 'detached — the study can belong to a real researcher',
        'study.reviewer_id': 'detached — the study can belong to a real researcher',
        'study_proposal_comment.author_id': 'deleted',
        'study_review_comment.author_id': 'deleted (ON DELETE RESTRICT)',
        'user_public_key.user_id': 'deleted',
    }

    // Postgres removes these without help, so the delete list does not need to name them.
    const DB_ENFORCED = new Set(['CASCADE', 'SET NULL', 'SET DEFAULT'])

    // Known gap, deliberately listed so this test states the truth rather than being tuned to
    // pass: publishing is an SI admin action, so a QA account that published a legal document
    // is still undeletable. Out of scope here — remove this entry when it is fixed.
    const KNOWN_UNHANDLED = new Set(['legal_document_version.published_by'])

    // References the delete has to clear itself: every FK to user.id the database does not
    // already handle on its own.
    const referencesNeedingHandling = async () => {
        const { rows } = await sql<{ reference: string; deleteRule: string }>`
            SELECT tc.table_name || '.' || kcu.column_name AS reference,
                   rc.delete_rule AS "deleteRule"
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage ccu
              ON tc.constraint_name = ccu.constraint_name
            JOIN information_schema.referential_constraints rc
              ON tc.constraint_name = rc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND ccu.table_name = 'user'
              AND ccu.column_name = 'id'
        `.execute(db)

        // Guards the query itself: an information_schema shape change that returned nothing would
        // otherwise make these tests pass while checking nothing at all.
        expect(rows.length).toBeGreaterThan(0)

        return rows.filter((row) => !DB_ENFORCED.has(row.deleteRule)).map((row) => row.reference)
    }

    it('handles every foreign key that references user.id', async () => {
        const unhandled = (await referencesNeedingHandling()).filter(
            (reference) => !(reference in HANDLED) && !KNOWN_UNHANDLED.has(reference),
        )

        expect(unhandled).toEqual([])
    })

    // The lists above are only meaningful while they describe reality: a reference that is
    // dropped, or gains a cascade, should be removed rather than left as dead weight that
    // silently excuses a future table of the same name.
    it('lists no reference that no longer needs handling', async () => {
        const needsHandling = new Set(await referencesNeedingHandling())
        const stale = [...Object.keys(HANDLED), ...KNOWN_UNHANDLED].filter((reference) => !needsHandling.has(reference))

        expect(stale).toEqual([])
    })
})
