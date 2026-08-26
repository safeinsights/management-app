import { describe, it, expect, vi, type Mock } from 'vitest'
import {
    db,
    insertTestOrg,
    insertTestUser,
    insertTestStudyData,
    mockSessionWithTestData,
    readTestSupportFile,
    faker,
    qaEmail,
} from '@/tests/unit.helpers'
import { verifyToken } from '@clerk/nextjs/server'
import { headers } from 'next/headers'
import { deleteFolderContents } from '@/server/aws'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return { ...actual, deleteFolderContents: vi.fn(async () => {}) }
})

const { PATCH, DELETE } = await import('./route')

// Rows are inserted directly rather than through the publish/acknowledge actions, which would drag
// this suite's setup through their S3 mocks. Only the acknowledgement's FK to user matters here.
//
// `publisherId` is a different account on purpose: publishing is an SI admin action, so pointing
// legal_document_version.published_by at the user being deleted would trip that FK first and the
// test would pass for the wrong reason.
async function acknowledgeLegalDocument(userId: string, publisherId: string) {
    const document = await db
        .insertInto('legalDocument')
        .values({ type: 'TOS', orgId: null, studyId: null })
        .onConflict((oc) => oc.constraint('legal_document_scope_unique').doNothing())
        .returning('id')
        .executeTakeFirst()
    const documentId =
        document?.id ??
        (
            await db
                .selectFrom('legalDocument')
                .select('id')
                .where('type', '=', 'TOS')
                .where('orgId', 'is', null)
                .where('studyId', 'is', null)
                .executeTakeFirstOrThrow()
        ).id

    // published_at/published_by/version_number are constrained to be set together.
    const version = await db
        .insertInto('legalDocumentVersion')
        .values({
            legalDocumentId: documentId,
            fileName: 'terms.md',
            filePath: `legal/${faker.string.uuid()}/terms.md`,
            format: 'md',
            publishedAt: new Date(),
            publishedBy: publisherId,
            versionNumber: faker.number.int({ min: 1, max: 1_000_000 }),
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    await db.insertInto('legalDocumentAcknowledgement').values({ legalDocumentVersionId: version.id, userId }).execute()
}

async function authenticateAsSiAdmin(options: { isSiAdmin: boolean } = { isSiAdmin: true }) {
    const mocks = await mockSessionWithTestData({ isSiAdmin: options.isSiAdmin })
    if (!mocks.auth) throw new Error('expected a mocked clerk auth')
    const { userId, sessionClaims } = mocks.auth()
    ;(verifyToken as Mock).mockResolvedValue({ sub: userId, ...sessionClaims })
    ;(await headers()).set('Authorization', 'Bearer fake-clerk-session-token')
    return mocks
}

// getAuditEntries omits metadata, which is the part that matters here.
// Destructive routes write an `attempted` row before the work and a `succeeded`/`failed`
// row after, so assertions have to name which outcome they mean.
const auditRowsFor = async (recordId: string) =>
    await db
        .selectFrom('audit')
        .select(['eventType', 'recordType', 'recordId', 'userId', 'metadata'])
        .where('recordId', '=', recordId)
        .orderBy('createdAt')
        // Both rows are written inside the same clock tick, so createdAt alone leaves
        // their order undefined; v7 ids are time-ordered and break the tie.
        .orderBy('id')
        .execute()

const auditRowFor = async (recordId: string, outcome = 'succeeded') => {
    const rows = await auditRowsFor(recordId)
    const row = rows.find((entry) => (entry.metadata as { outcome?: string } | null)?.outcome === outcome)
    if (!row) throw new Error(`no ${outcome} audit row for ${recordId}`)
    return row
}

const patchUser = (idOrEmail: string, body: unknown) =>
    PATCH(
        new Request(`http://localhost/api/qa/users/${encodeURIComponent(idOrEmail)}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ userId: encodeURIComponent(idOrEmail) }) },
    )

describe('PATCH /api/qa/users/[userId]', () => {
    it('applies orgs, key, and password in one call', async () => {
        await authenticateAsSiAdmin()
        const orgA = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const orgB = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org: orgA, email: qaEmail() })

        const response = await patchUser(user.id, {
            orgs: [{ slug: orgB.slug, isAdmin: true }],
            publicKey: await readTestSupportFile('public_key.pem'),
            password: 'qa-test-1234',
        })
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toMatchObject({
            userId: user.id,
            orgs: [{ slug: orgB.slug, isAdmin: true }],
            passwordSet: true,
        })
        expect(body.fingerprint).toEqual(expect.any(String))
    })

    it('accepts a url encoded email as the identifier', async () => {
        await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org, email: qaEmail() })

        const response = await patchUser(user.email!, { orgs: [] })

        expect(response.status).toBe(200)
        expect((await response.json()).userId).toBe(user.id)
    })

    it('returns 404 for an unknown user', async () => {
        await authenticateAsSiAdmin()

        const response = await patchUser(faker.string.uuid(), { orgs: [] })

        expect(response.status).toBe(404)
    })

    it('returns 400 for an invalid body', async () => {
        await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org, email: qaEmail() })

        const response = await patchUser(user.id, { orgs: 'not-an-array' })

        expect(response.status).toBe(400)
    })

    it('returns 400 for a malformed public key', async () => {
        await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org, email: qaEmail() })

        const response = await patchUser(user.id, { publicKey: 'not-a-key' })

        expect(response.status).toBe(400)
    })

    it('rejects a caller who is not an SI admin', async () => {
        await authenticateAsSiAdmin({ isSiAdmin: false })
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, isAdmin: false, email: qaEmail() })

        const response = await patchUser(user.id, { orgs: [] })

        expect(response.status).toBe(403)
        const memberships = await db.selectFrom('orgUser').select(['id']).where('userId', '=', user.id).execute()
        expect(memberships).toHaveLength(1)
    })
})

describe('QA account guard and audit trail', () => {
    it('returns 403 when the target is not a QA account', async () => {
        await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org, email: 'real.person@corp.com' })

        const response = await patchUser(user.id, { password: 'hunter2' })

        expect(response.status).toBe(403)
        expect((await response.json()).error).toContain('qa')
    })

    // These routes run on production, so every invocation must leave a record
    // attributed to the SI admin who made it.
    it('audits a provisioning call against the acting admin', async () => {
        const { user: admin } = await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org, email: qaEmail() })

        await patchUser(user.id, { orgs: [{ slug: org.slug }], password: 'qa-test-1234' })

        const entry = await auditRowFor(user.id)
        expect(entry).toMatchObject({ eventType: 'UPDATED', recordType: 'USER', userId: admin.id })
        expect(entry.metadata).toMatchObject({ via: 'qa-api', passwordSet: true })
    })

    // The audit row records that a password was set, never the password itself.
    it('never records the password in the audit metadata', async () => {
        await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org, email: qaEmail() })

        await patchUser(user.id, { password: 'sup3r-s3cret' })

        const entry = await auditRowFor(user.id)
        expect(JSON.stringify(entry)).not.toContain('sup3r-s3cret')
    })

    it('audits a deletion with the removed account', async () => {
        const { user: admin } = await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: qaEmail() })

        await DELETE(new Request('http://localhost', { method: 'DELETE' }), {
            params: Promise.resolve({ userId: user.id }),
        })

        const entry = await auditRowFor(user.id)
        expect(entry).toMatchObject({ eventType: 'DELETED', recordType: 'USER', userId: admin.id })
        expect(entry.metadata).toMatchObject({ email: user.email, via: 'qa-api' })
    })

    // The attempt row is what survives a crash between the DB commit and the S3/Clerk
    // cleanup — without it a half-finished deletion leaves no trace at all.
    it('records the attempt before the destructive work and the outcome after', async () => {
        await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: qaEmail() })

        await DELETE(new Request('http://localhost', { method: 'DELETE' }), {
            params: Promise.resolve({ userId: user.id }),
        })

        const outcomes = (await auditRowsFor(user.id)).map((row) => (row.metadata as { outcome?: string }).outcome)
        expect(outcomes).toEqual(['attempted', 'succeeded'])
    })

    it('records a failed outcome when cleanup fails after the DB commit', async () => {
        await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: qaEmail() })
        ;(deleteFolderContents as Mock).mockRejectedValueOnce(new Error('s3 is down'))
        // A study forces the S3 cleanup path that is being made to fail.
        await insertTestStudyData({ org, researcherId: user.id })

        await expect(
            DELETE(new Request('http://localhost', { method: 'DELETE' }), {
                params: Promise.resolve({ userId: user.id }),
            }),
        ).rejects.toThrow('s3 is down')

        const rows = await auditRowsFor(user.id)
        expect(rows.map((row) => (row.metadata as { outcome?: string }).outcome)).toEqual(['attempted', 'failed'])
        expect((rows[1].metadata as { error?: string }).error).toContain('s3 is down')
    })
})

describe('DELETE /api/qa/users/[userId]', () => {
    it('deletes a user identified by email', async () => {
        await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: qaEmail() })

        const response = await DELETE(new Request('http://localhost', { method: 'DELETE' }), {
            params: Promise.resolve({ userId: encodeURIComponent(user.email!) }),
        })

        expect(response.status).toBe(200)
        const deleted = await db.selectFrom('user').select('id').where('id', '=', user.id).executeTakeFirst()
        expect(deleted).toBeUndefined()
    })

    // The signup flow acknowledges every enforced published document, so a real account always
    // carries these rows while insertTestUser alone does not. Deleting without clearing them
    // raises an FK violation that surfaces as a 500, which is how every QA signup run came to
    // strand its accounts on qa.
    it('deletes a user who has acknowledged a legal document', async () => {
        const { user: admin } = await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: qaEmail() })
        await acknowledgeLegalDocument(user.id, admin.id)

        const response = await DELETE(new Request('http://localhost', { method: 'DELETE' }), {
            params: Promise.resolve({ userId: user.id }),
        })

        expect(response.status).toBe(200)
        const deleted = await db.selectFrom('user').select('id').where('id', '=', user.id).executeTakeFirst()
        expect(deleted).toBeUndefined()
        const acks = await db
            .selectFrom('legalDocumentAcknowledgement')
            .select('id')
            .where('userId', '=', user.id)
            .execute()
        expect(acks).toHaveLength(0)
    })

    it('returns 404 for an unknown user', async () => {
        await authenticateAsSiAdmin()

        const response = await DELETE(new Request('http://localhost', { method: 'DELETE' }), {
            params: Promise.resolve({ userId: faker.string.uuid() }),
        })

        expect(response.status).toBe(404)
    })

    // The QA guard now lives in findQaUser, one layer above the delete itself, so that the
    // SI-admin route can reach deleteUserCompletely without it. This pins that the QA route
    // did not follow it out: /api/qa/* must still refuse a real account.
    it('refuses a non-QA account and leaves it intact', async () => {
        await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: 'real.person@corp.com' })

        const response = await DELETE(new Request('http://localhost', { method: 'DELETE' }), {
            params: Promise.resolve({ userId: user.id }),
        })

        expect(response.status).toBe(403)
        const stillThere = await db.selectFrom('user').select('id').where('id', '=', user.id).executeTakeFirst()
        expect(stillThere).toBeDefined()
    })
})
