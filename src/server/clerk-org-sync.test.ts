import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
    db,
    faker,
    insertTestOrg,
    insertTestUser,
    installFakeClerkOrgs,
    mockSessionWithTestData,
} from '@/tests/unit.helpers'
import logger from '@/lib/logger'
import { withTransaction } from '@/server/request-context'
import { deleteOrgFromClerk, removeMembershipFromClerk, syncMembershipToClerk, syncOrgToClerk } from './clerk-org-sync'

const setup = async () => {
    await mockSessionWithTestData({ isSiAdmin: true })
    const fake = installFakeClerkOrgs()
    const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
    const { user } = await insertTestUser({ org })
    const clerkOrg = () => [...fake.orgs.values()].find((o) => o.slug === org.slug)
    return { fake, org, user, clerkOrg }
}

describe('clerk org membership wrappers', () => {
    it('syncs and removes a membership using DB ids', async () => {
        const { fake, org, user, clerkOrg } = await setup()
        await syncMembershipToClerk({ userId: user.id, orgId: org.id, isAdmin: true })
        expect(fake.members.get(clerkOrg()!.id)?.get(user.clerkId)).toBe('org:admin')
        await removeMembershipFromClerk({ userId: user.id, orgId: org.id })
        expect(fake.members.get(clerkOrg()!.id)?.has(user.clerkId)).toBe(false)
    })

    it('waits for the commit, and a rollback never reaches Clerk', async () => {
        const { fake, org, user } = await setup()

        await withTransaction(db, async () => {
            await syncMembershipToClerk({ userId: user.id, orgId: org.id, isAdmin: true })
            expect(fake.api.getOrganization).not.toHaveBeenCalled()
        })
        expect(fake.api.getOrganization).toHaveBeenCalled()
        fake.api.getOrganization.mockClear()

        await expect(
            withTransaction(db, async () => {
                await syncOrgToClerk({ slug: 'rolled-back', name: 'Rolled Back', type: 'lab' })
                await removeMembershipFromClerk({ userId: user.id, orgId: org.id })
                throw new Error('rollback')
            }),
        ).rejects.toThrow('rollback')
        expect(fake.api.getOrganization).not.toHaveBeenCalled()
    })

    it('logs a Clerk failure instead of throwing', async () => {
        const logError = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
        const { fake, org, user } = await setup()
        fake.api.getOrganization.mockRejectedValue(Object.assign(new Error('clerk down'), { status: 500 }))

        await syncMembershipToClerk({ userId: user.id, orgId: org.id, isAdmin: true })
        await withTransaction(db, () => deleteOrgFromClerk(org.slug))

        expect(logError).toHaveBeenCalledTimes(2)
        expect(logError).toHaveBeenCalledWith(expect.objectContaining({ message: 'clerk down' }))
    })

    it('makes no Clerk call when CLERK_ORG_SYNC is off', async () => {
        vi.stubEnv('CLERK_ORG_SYNC', 'off')
        onTestFinished(() => {
            vi.unstubAllEnvs()
        })
        const { fake, org, user } = await setup()

        await syncOrgToClerk(org)
        await deleteOrgFromClerk(org.slug)
        await syncMembershipToClerk({ userId: user.id, orgId: org.id, isAdmin: true })
        await removeMembershipFromClerk({ userId: user.id, orgId: org.id })

        for (const call of Object.values(fake.api)) expect(call).not.toHaveBeenCalled()
    })
})
