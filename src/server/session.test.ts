import { describe, expect, it } from 'vitest'
import type { JwtPayload } from 'jsonwebtoken'
import { headers } from 'next/headers'
import { db, insertTestOrg, insertTestUser, mockClerkSession } from '@/tests/unit.helpers'
import { clientUserInfo, clientUserInfoForRequest, marshalSession } from './session'

const claimsWithoutOrgs = (userId: string) =>
    ({ userMetadata: { format: 'v3', user: { id: userId }, teams: null } }) as unknown as JwtPayload

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
        await db.deleteFrom('orgUser').where('userId', '=', user.id).execute()

        const session = await marshalSession(user.clerkId, claimsWithoutOrgs(user.id))

        expect(session?.orgs).toEqual({})
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
