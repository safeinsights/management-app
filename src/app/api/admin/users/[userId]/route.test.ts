import { describe, it, expect, vi, type Mock } from 'vitest'
import { db, insertTestOrg, insertTestUser, mockSessionWithTestData, faker, qaEmail } from '@/tests/unit.helpers'
import { verifyToken } from '@clerk/nextjs/server'
import { headers } from 'next/headers'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return { ...actual, deleteFolderContents: vi.fn(async () => {}) }
})

const { DELETE } = await import('./route')

async function authenticateAsSiAdmin(options: { isSiAdmin: boolean } = { isSiAdmin: true }) {
    const mocks = await mockSessionWithTestData({ isSiAdmin: options.isSiAdmin })
    if (!mocks.auth) throw new Error('expected a mocked clerk auth')
    const { userId, sessionClaims } = mocks.auth()
    ;(verifyToken as Mock).mockResolvedValue({ sub: userId, ...sessionClaims })
    ;(await headers()).set('Authorization', 'Bearer fake-clerk-session-token')
    return mocks
}

const deleteUser = (idOrEmail: string) =>
    DELETE(new Request('http://localhost', { method: 'DELETE' }), {
        params: Promise.resolve({ userId: encodeURIComponent(idOrEmail) }),
    })

const auditRowFor = async (recordId: string, outcome = 'succeeded') => {
    const rows = await db
        .selectFrom('audit')
        .select(['eventType', 'recordType', 'recordId', 'userId', 'metadata'])
        .where('recordId', '=', recordId)
        .orderBy('createdAt')
        // Both rows are written inside the same clock tick, so createdAt alone leaves
        // their order undefined; v7 ids are time-ordered and break the tie.
        .orderBy('id')
        .execute()
    const row = rows.find((entry) => (entry.metadata as { outcome?: string } | null)?.outcome === outcome)
    if (!row) throw new Error(`no ${outcome} audit row for ${recordId}`)
    return row
}

describe('DELETE /api/admin/users/[userId]', () => {
    // The whole reason this route exists: the QA route refuses this exact account.
    it('deletes an ordinary account that the QA route would refuse', async () => {
        await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: `real-${faker.string.alpha(10)}@example.com` })

        const response = await deleteUser(user.email!)

        expect(response.status).toBe(200)
        const deleted = await db.selectFrom('user').select('id').where('id', '=', user.id).executeTakeFirst()
        expect(deleted).toBeUndefined()
    })

    it('deletes by user id as well as by email', async () => {
        await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: `real-${faker.string.alpha(10)}@example.com` })

        const response = await deleteUser(user.id)

        expect(response.status).toBe(200)
        const deleted = await db.selectFrom('user').select('id').where('id', '=', user.id).executeTakeFirst()
        expect(deleted).toBeUndefined()
    })

    it('removes the org membership along with the user', async () => {
        await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: `real-${faker.string.alpha(10)}@example.com` })

        await deleteUser(user.id)

        const memberships = await db.selectFrom('orgUser').select('id').where('userId', '=', user.id).execute()
        expect(memberships).toHaveLength(0)
    })

    // A QA account is still an account; the admin route is a superset of the QA one.
    it('also deletes a QA account', async () => {
        await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: qaEmail() })

        const response = await deleteUser(user.id)

        expect(response.status).toBe(200)
        const deleted = await db.selectFrom('user').select('id').where('id', '=', user.id).executeTakeFirst()
        expect(deleted).toBeUndefined()
    })

    it('returns 404 for an unknown user', async () => {
        await authenticateAsSiAdmin()

        const response = await deleteUser(faker.string.uuid())

        expect(response.status).toBe(404)
    })

    // Deleting the actor would strand the audit rows' attribution and revoke the caller's
    // own access halfway through the request.
    it('refuses to delete the calling admin', async () => {
        const { user: admin } = await authenticateAsSiAdmin()

        const response = await deleteUser(admin.id)

        expect(response.status).toBe(400)
        const stillThere = await db.selectFrom('user').select('id').where('id', '=', admin.id).executeTakeFirst()
        expect(stillThere).toBeDefined()
    })

    // SI-admin auth is the ONLY guard on this route, so these two cases are load-bearing.
    it('rejects a caller who is not an SI admin', async () => {
        await authenticateAsSiAdmin({ isSiAdmin: false })
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: `real-${faker.string.alpha(10)}@example.com` })

        const response = await deleteUser(user.id)

        expect(response.status).toBe(403)
        const stillThere = await db.selectFrom('user').select('id').where('id', '=', user.id).executeTakeFirst()
        expect(stillThere).toBeDefined()
    })

    it('rejects an unauthenticated caller', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: `real-${faker.string.alpha(10)}@example.com` })
        ;(await headers()).delete('Authorization')

        const response = await deleteUser(user.id)

        expect(response.status).toBe(401)
        const stillThere = await db.selectFrom('user').select('id').where('id', '=', user.id).executeTakeFirst()
        expect(stillThere).toBeDefined()
    })

    it('audits the deletion against the acting admin, tagged admin-api', async () => {
        const { user: admin } = await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: `real-${faker.string.alpha(10)}@example.com` })

        await deleteUser(user.id)

        const row = await auditRowFor(user.id)
        expect(row).toMatchObject({ eventType: 'DELETED', recordType: 'USER', userId: admin.id })
        // `via` is what separates a real offboarding from QA fixture churn in the trail.
        expect(row.metadata).toMatchObject({ via: 'admin-api', email: user.email })
    })

    it('records the attempt before the destructive work and the outcome after', async () => {
        await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: `real-${faker.string.alpha(10)}@example.com` })

        await deleteUser(user.id)

        const attempted = await auditRowFor(user.id, 'attempted')
        expect(attempted.metadata).toMatchObject({ via: 'admin-api' })
        const succeeded = await auditRowFor(user.id, 'succeeded')
        expect(succeeded.metadata).toMatchObject({ via: 'admin-api' })
    })
})
