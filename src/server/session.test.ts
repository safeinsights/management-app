import { describe, expect, it, vi } from 'vitest'
import PG from 'pg'
import type { JwtPayload } from 'jsonwebtoken'
import { headers } from 'next/headers'
import {
    db,
    faker,
    insertTestOrg,
    insertTestUser,
    mockClerkSession,
    mockSessionWithTestData,
} from '@/tests/unit.helpers'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { clientUserInfo, clientUserInfoForRequest, marshalSession } from './session'

const claimsWithoutOrgs = (userId: string) =>
    ({ userMetadata: { format: 'v3', user: { id: userId }, teams: null } }) as unknown as JwtPayload

const claimsWithOrgs = (userId: string, orgs: UserInfo['orgs']) =>
    ({ userMetadata: { format: 'v3', user: { id: userId }, teams: null, orgs } }) as unknown as JwtPayload

// Counts the SELECT round trips that reach Postgres while `run` executes.
const countSelects = async (run: () => Promise<unknown>) => {
    const query = vi.spyOn(PG.Client.prototype, 'query')
    const before = query.mock.calls.length
    await run()
    return query.mock.calls.slice(before).filter(([sql]) => /^\s*select/i.test(String(sql))).length
}

describe('marshalSession', () => {
    it('loads orgs from the database when the token carries none', async () => {
        const org = await insertTestOrg({ slug: 'otter752-lab', type: 'lab' })
        const { user } = await insertTestUser({ org: { id: org.id, slug: org.slug, type: org.type } })

        const session = await marshalSession(user.clerkId, claimsWithoutOrgs(user.id))

        expect(session?.orgs[org.slug]).toMatchObject({ id: org.id, slug: org.slug, type: 'lab', isAdmin: false })
        expect(session?.belongsToLab).toBe(true)
    })

    it('drops an org as soon as the membership row is removed', async () => {
        const org = await insertTestOrg({ slug: 'otter752-gone', type: 'enclave' })
        const { user } = await insertTestUser({ org: { id: org.id, slug: org.slug, type: org.type } })
        expect((await marshalSession(user.clerkId, claimsWithoutOrgs(user.id)))?.orgs).toHaveProperty(org.slug)

        await db.deleteFrom('orgUser').where('userId', '=', user.id).execute()

        expect((await marshalSession(user.clerkId, claimsWithoutOrgs(user.id)))?.orgs).toEqual({})
    })

    it('reads the user and the org list in one query', async () => {
        const org = await insertTestOrg({ slug: 'otter752-one-query', type: 'lab' })
        const { user } = await insertTestUser({ org: { id: org.id, slug: org.slug, type: org.type } })

        expect(await countSelects(() => marshalSession(user.clerkId, claimsWithoutOrgs(user.id)))).toBe(1)
    })

    it('uses the orgs in a token that still carries them, with one query for the user', async () => {
        const org = await insertTestOrg({ slug: 'otter752-legacy', type: 'lab' })
        const { user } = await insertTestUser({ org: { id: org.id, slug: org.slug, type: org.type } })
        const ghost = { id: faker.string.uuid(), slug: 'otter752-not-in-db', type: 'lab' as const, isAdmin: false }
        let session: Awaited<ReturnType<typeof marshalSession>> = null

        const selects = await countSelects(async () => {
            session = await marshalSession(user.clerkId, claimsWithOrgs(user.id, { [ghost.slug]: ghost }))
        })

        expect(selects).toBe(1)
        expect(session!.orgs).toEqual({ [ghost.slug]: ghost })
    })

    it('makes a member of the SI admin org an SI admin from the database', async () => {
        const { user } = await mockSessionWithTestData({ isSiAdmin: true, slimMetadata: true })

        const session = await marshalSession(user.clerkId, claimsWithoutOrgs(user.id))

        expect(session?.orgs[CLERK_ADMIN_ORG_SLUG]?.isAdmin).toBe(true)
        expect(session?.user.isSiAdmin).toBe(true)
    })

    it('re-syncs from Clerk when the token names the user row of another Clerk user', async () => {
        const org = await insertTestOrg({ slug: 'otter752-other', type: 'lab' })
        const { user: other } = await insertTestUser({ org: { id: org.id, slug: org.slug, type: org.type } })
        const { client } = mockClerkSession({ clerkUserId: 'c-otter752', userId: other.id, orgSlug: org.slug })!

        const session = await marshalSession('c-otter752', claimsWithoutOrgs(other.id))

        expect(client.users.getUser).toHaveBeenCalledWith('c-otter752')
        expect(session?.orgs ?? {}).not.toHaveProperty(org.slug)
    })

    it('re-syncs from Clerk when a v3 token has no user', async () => {
        const { client } = mockClerkSession({ clerkUserId: 'c-no-user', userId: '', orgSlug: 'any-org' })!
        const claims = { userMetadata: { format: 'v3', teams: null } } as unknown as JwtPayload

        await marshalSession('c-no-user', claims)

        expect(client.users.getUser).toHaveBeenCalledWith('c-no-user')
    })
})

describe('clientUserInfo', () => {
    it('keeps only the user id and the orgs, so the result can go to the client', async () => {
        const org = await insertTestOrg({ slug: 'otter752-client', type: 'lab' })
        const { user } = await insertTestUser({ org: { id: org.id, slug: org.slug, type: org.type } })
        const session = await marshalSession(user.clerkId, claimsWithoutOrgs(user.id))

        const info = clientUserInfo(session)

        expect(info).toEqual({
            format: 'v3',
            user: { id: user.id },
            teams: null,
            orgs: { [org.slug]: expect.objectContaining({ id: org.id, type: 'lab', isAdmin: false }) },
        })
        expect(JSON.parse(JSON.stringify(info))).toEqual(info)
    })

    it('returns null without a session', () => {
        expect(clientUserInfo(null)).toBeNull()
    })
})

describe('clientUserInfoForRequest', () => {
    it('returns null without calling Clerk when the proxy did not run', async () => {
        const { auth } = await import('@clerk/nextjs/server')

        expect(await clientUserInfoForRequest()).toBeNull()
        expect(auth).not.toHaveBeenCalled()
    })

    it('lets a session error through when the proxy ran', async () => {
        const { auth } = mockClerkSession({ clerkUserId: 'c1', userId: 'u1', orgSlug: 'any-org' })!
        auth.mockImplementation(() => {
            throw new Error('database is down')
        })
        ;(await headers()).set('x-clerk-auth-status', 'signed-in')

        await expect(clientUserInfoForRequest()).rejects.toThrow('database is down')
    })
})
