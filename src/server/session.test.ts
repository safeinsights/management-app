import { describe, expect, it } from 'vitest'
import type { JwtPayload } from 'jsonwebtoken'
import { db, insertTestOrg, insertTestUser } from '@/tests/unit.helpers'
import { marshalSession } from './session'

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
