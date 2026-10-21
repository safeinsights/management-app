import { describe, expect, it } from 'vitest'
import { insertTestOrg, insertTestUser, installFakeClerkOrgs, mockSessionWithTestData } from '@/tests/unit.helpers'
import { removeMembershipFromClerk, syncMembershipToClerk } from './clerk-org-sync'

describe('clerk org membership wrappers', () => {
    it('syncs and removes a membership using DB ids', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const fake = installFakeClerkOrgs()
        const org = await insertTestOrg({ slug: 'wrapper-org', type: 'lab' })
        const { user } = await insertTestUser({ org })
        await syncMembershipToClerk({ userId: user.id, orgId: org.id, isAdmin: true })
        const [clerkOrg] = [...fake.orgs.values()].filter((o) => o.slug === 'wrapper-org')
        expect(fake.members.get(clerkOrg.id)?.get(user.clerkId)).toBe('org:admin')
        await removeMembershipFromClerk({ userId: user.id, orgId: org.id })
        expect(fake.members.get(clerkOrg.id)?.has(user.clerkId)).toBe(false)
    })
})
