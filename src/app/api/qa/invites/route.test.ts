import { describe, it, expect, vi, type Mock } from 'vitest'
import { db, insertTestOrg, insertTestUser, mockSessionWithTestData, faker, qaEmail } from '@/tests/unit.helpers'
import { verifyToken } from '@clerk/nextjs/server'
import { headers } from 'next/headers'
import { POST } from './route'

vi.mock('@/server/mailgun', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/mailgun')>()
    return { ...actual, deliver: vi.fn(async () => {}) }
})

/**
 * clerkMiddleware doesn't run on /api/*, so the routes verify the SI admin's session token
 * straight from the Authorization header. Mirror qa-cleanup.test.ts: set the header and make
 * verifyToken resolve to the claims mockSessionWithTestData wired into the session.
 */
async function authenticateAsSiAdmin(options: { isSiAdmin: boolean } = { isSiAdmin: true }) {
    const mocks = await mockSessionWithTestData({ isSiAdmin: options.isSiAdmin })
    if (!mocks.auth) throw new Error('expected a mocked clerk auth')
    const { userId, sessionClaims } = mocks.auth()
    ;(verifyToken as Mock).mockResolvedValue({ sub: userId, ...sessionClaims })
    ;(await headers()).set('Authorization', 'Bearer fake-clerk-session-token')
    if (mocks.client) {
        ;(mocks.client.users.getUserList as Mock).mockResolvedValue({ data: [], totalCount: 0 })
    }
    return mocks
}

const postInvite = (body: unknown) =>
    POST(new Request('http://localhost/api/qa/invites', { method: 'POST', body: JSON.stringify(body) }))

describe('POST /api/qa/invites', () => {
    it('creates an invite and returns its url', async () => {
        await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })

        const response = await postInvite({ email: 'qa-new@test.com', orgSlug: org.slug })
        const body = await response.json()

        expect(response.status).toBe(201)
        expect(body).toMatchObject({ email: 'qa-new@test.com', orgSlug: org.slug, alreadyInvited: false })
        expect(body.inviteUrl).toContain(`/account/invitation/${body.inviteId}`)
    })

    it('returns 200 and the same invite when one is outstanding', async () => {
        await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const email = qaEmail()

        const first = await (await postInvite({ email, orgSlug: org.slug })).json()
        const response = await postInvite({ email, orgSlug: org.slug })
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toMatchObject({ inviteId: first.inviteId, alreadyInvited: true })
    })

    it('returns 409 when the email already belongs to a member', async () => {
        const { client } = await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org, email: qaEmail() })
        if (!client) throw new Error('expected a mocked clerk client')
        ;(client.users.getUserList as Mock).mockResolvedValue({ data: [{ id: user.clerkId }], totalCount: 1 })

        const response = await postInvite({ email: user.email, orgSlug: org.slug })

        expect(response.status).toBe(409)
        expect((await response.json()).error).toContain(org.slug)
    })

    it('returns 404 for an unknown org', async () => {
        await authenticateAsSiAdmin()

        const response = await postInvite({ email: qaEmail(), orgSlug: 'nope' })

        expect(response.status).toBe(404)
    })

    it('returns 400 for an invalid body', async () => {
        await authenticateAsSiAdmin()

        const response = await postInvite({ email: 'not-an-email', orgSlug: 'x' })

        expect(response.status).toBe(400)
    })

    // Invites run on production too, so they may only ever be addressed to a QA account.
    it('returns 403 when the invited email is not qa-prefixed', async () => {
        await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })

        const response = await postInvite({ email: 'real.person@corp.com', orgSlug: org.slug })

        expect(response.status).toBe(403)
        const invites = await db.selectFrom('pendingUser').select(['id']).where('orgId', '=', org.id).execute()
        expect(invites).toHaveLength(0)
    })

    it('audits the invite against the acting admin', async () => {
        const { user: admin } = await authenticateAsSiAdmin()
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const email = qaEmail()

        const body = await (await postInvite({ email, orgSlug: org.slug })).json()

        const entry = await db
            .selectFrom('audit')
            .select(['eventType', 'recordType', 'userId', 'metadata'])
            .where('recordId', '=', body.inviteId)
            .executeTakeFirstOrThrow()
        expect(entry).toMatchObject({ eventType: 'INVITED', recordType: 'USER', userId: admin.id })
        expect(entry.metadata).toMatchObject({ email, orgSlug: org.slug, via: 'qa-api' })
    })

    it('rejects a caller who is not an SI admin', async () => {
        await authenticateAsSiAdmin({ isSiAdmin: false })
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })

        const response = await postInvite({ email: qaEmail(), orgSlug: org.slug })

        expect(response.status).toBe(403)
        const invites = await db.selectFrom('pendingUser').select(['id']).where('orgId', '=', org.id).execute()
        expect(invites).toHaveLength(0)
    })
})
