import { describe, it, expect, type Mock } from 'vitest'
import {
    db,
    insertTestOrg,
    insertTestUser,
    mockSessionWithTestData,
    readTestSupportFile,
    faker,
    qaEmail,
} from '@/tests/unit.helpers'
import { verifyToken } from '@clerk/nextjs/server'
import { headers } from 'next/headers'
import { PATCH, DELETE } from './route'

async function authenticateAsSiAdmin(options: { isSiAdmin: boolean } = { isSiAdmin: true }) {
    const mocks = await mockSessionWithTestData({ isSiAdmin: options.isSiAdmin })
    if (!mocks.auth) throw new Error('expected a mocked clerk auth')
    const { userId, sessionClaims } = mocks.auth()
    ;(verifyToken as Mock).mockResolvedValue({ sub: userId, ...sessionClaims })
    ;(await headers()).set('Authorization', 'Bearer fake-clerk-session-token')
    return mocks
}

// getAuditEntries omits metadata, which is the part that matters here.
const auditRowFor = async (recordId: string) =>
    await db
        .selectFrom('audit')
        .select(['eventType', 'recordType', 'recordId', 'userId', 'metadata'])
        .where('recordId', '=', recordId)
        .executeTakeFirstOrThrow()

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

    it('returns 404 for an unknown user', async () => {
        await authenticateAsSiAdmin()

        const response = await DELETE(new Request('http://localhost', { method: 'DELETE' }), {
            params: Promise.resolve({ userId: faker.string.uuid() }),
        })

        expect(response.status).toBe(404)
    })
})
