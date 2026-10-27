import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
    beforeEach,
    enableClerkOrgSync,
    db,
    faker,
    insertTestOrg,
    insertTestUser,
    installFakeClerkOrgs,
    mockSessionWithTestData,
} from '@/tests/unit.helpers'
import logger from '@/lib/logger'
import { localStorageContext, withTransaction } from '@/server/request-context'
import { deleteOrgFromClerk, removeMembershipFromClerk, syncMembershipToClerk, syncOrgToClerk } from './clerk-org-sync'

beforeEach(enableClerkOrgSync)

const setup = async () => {
    await mockSessionWithTestData({ isSiAdmin: true })
    const fake = installFakeClerkOrgs()
    const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
    const { user } = await insertTestUser({ org, isAdmin: true })
    const clerkOrg = () => [...fake.orgs.values()].find((o) => o.slug === org.slug)
    return { fake, org, user, clerkOrg }
}

describe('clerk org membership wrappers', () => {
    it('syncs and removes a membership using DB ids', async () => {
        const { fake, org, user, clerkOrg } = await setup()
        await syncMembershipToClerk({ userId: user.id, orgId: org.id })
        expect(fake.members.get(clerkOrg()!.id)?.get(user.clerkId)).toBe('org:admin')
        await db.deleteFrom('orgUser').where('userId', '=', user.id).execute()
        await removeMembershipFromClerk({ userId: user.id, orgId: org.id })
        expect(fake.members.get(clerkOrg()!.id)?.has(user.clerkId)).toBe(false)
    })

    it('creates an org with no members, reading it from the database', async () => {
        const { fake, org, clerkOrg } = await setup()
        await syncOrgToClerk(org.slug)
        expect(clerkOrg()).toMatchObject({ name: org.name, publicMetadata: { type: 'lab' } })
        expect(fake.members.get(clerkOrg()!.id)?.size).toBe(0)
    })

    it('waits for the commit, and a rollback never reaches Clerk', async () => {
        const { fake, org, user } = await setup()

        await withTransaction(db, async () => {
            await syncMembershipToClerk({ userId: user.id, orgId: org.id })
            expect(fake.api.getOrganization).not.toHaveBeenCalled()
        })
        expect(fake.api.getOrganization).toHaveBeenCalled()
        fake.api.getOrganization.mockClear()

        await expect(
            withTransaction(db, async () => {
                await syncOrgToClerk(org.slug)
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

        await syncMembershipToClerk({ userId: user.id, orgId: org.id })
        await withTransaction(db, () => deleteOrgFromClerk(org.slug))

        expect(logError).toHaveBeenCalledTimes(2)
        expect(logError).toHaveBeenCalledWith('clerk-org-sync failed', {
            operation: 'reconcileMembership',
            orgSlug: org.slug,
            error: expect.objectContaining({ message: 'clerk down' }),
        })
        expect(logError).toHaveBeenCalledWith('clerk-org-sync failed', {
            operation: 'reconcileOrg',
            orgSlug: org.slug,
            error: expect.objectContaining({ message: 'clerk down' }),
        })
    })

    it('ends with the final role even when the first hook runs last', async () => {
        const { fake, org, user, clerkOrg } = await setup()
        const hooks: (() => Promise<unknown>)[] = []
        const setRole = async (isAdmin: boolean) => {
            await db.updateTable('orgUser').set({ isAdmin }).where('userId', '=', user.id).execute()
            await localStorageContext.run({ afterCommit: (hook) => hooks.push(hook) }, () =>
                syncMembershipToClerk({ userId: user.id, orgId: org.id }),
            )
        }
        await setRole(false)
        await setRole(true)
        for (const hook of hooks.reverse()) await hook()
        expect(fake.members.get(clerkOrg()!.id)?.get(user.clerkId)).toBe('org:admin')
    })

    it('ends with the committed role when a newer change syncs while the first hook waits on Clerk', async () => {
        const { fake, org, user, clerkOrg } = await setup()
        const hooks: (() => Promise<unknown>)[] = []
        const queueSync = () =>
            localStorageContext.run({ afterCommit: (hook) => hooks.push(hook) }, () =>
                syncMembershipToClerk({ userId: user.id, orgId: org.id }),
            )
        const update = fake.api.updateOrganizationMembership.getMockImplementation()!
        let release = () => {}
        const held = new Promise<void>((resolve) => (release = resolve))
        fake.api.updateOrganizationMembership.mockImplementationOnce(async (params) => {
            await held
            return update(params)
        })

        await queueSync()
        const promotion = hooks[0]()
        await vi.waitFor(() => expect(fake.api.updateOrganizationMembership).toHaveBeenCalled())

        await db.updateTable('orgUser').set({ isAdmin: false }).where('userId', '=', user.id).execute()
        await queueSync()
        await hooks[1]()
        expect(fake.members.get(clerkOrg()!.id)?.get(user.clerkId)).toBe('org:member')

        release()
        await promotion
        expect(fake.members.get(clerkOrg()!.id)?.get(user.clerkId)).toBe('org:member')
    })

    it('logs a failure when the database keeps changing during the sync', async () => {
        const logError = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
        const { fake, org, user } = await setup()
        const update = fake.api.updateOrganizationMembership.getMockImplementation()!
        let isAdmin = true
        fake.api.updateOrganizationMembership.mockImplementation(async (params) => {
            isAdmin = !isAdmin
            await db.updateTable('orgUser').set({ isAdmin }).where('userId', '=', user.id).execute()
            return update(params)
        })

        await syncMembershipToClerk({ userId: user.id, orgId: org.id })

        expect(fake.api.updateOrganizationMembership).toHaveBeenCalledTimes(3)
        expect(logError).toHaveBeenCalledWith('clerk-org-sync failed', {
            operation: 'reconcileMembership',
            orgSlug: org.slug,
            error: expect.objectContaining({ message: 'database still changing after 3 passes' }),
        })
    })

    it('ends with the newest name when two renames sync in reverse order', async () => {
        const { org, clerkOrg } = await setup()
        await syncOrgToClerk(org.slug)
        const hooks: (() => Promise<unknown>)[] = []
        const rename = async (name: string) => {
            await db.updateTable('org').set({ name }).where('id', '=', org.id).execute()
            await localStorageContext.run({ afterCommit: (hook) => hooks.push(hook) }, () => syncOrgToClerk(org.slug))
        }
        await rename('First rename')
        await rename('Second rename')
        for (const hook of hooks.reverse()) await hook()
        expect(clerkOrg()?.name).toBe('Second rename')
    })

    it('deletes the Clerk org when a membership hook runs after the org is deleted', async () => {
        const { fake, org, user, clerkOrg } = await setup()
        await syncMembershipToClerk({ userId: user.id, orgId: org.id })
        const hooks: (() => Promise<unknown>)[] = []
        await localStorageContext.run({ afterCommit: (hook) => hooks.push(hook) }, () =>
            syncMembershipToClerk({ userId: user.id, orgId: org.id }),
        )
        await db.deleteFrom('orgUser').where('orgId', '=', org.id).execute()
        await db.deleteFrom('org').where('id', '=', org.id).execute()
        for (const hook of hooks) await hook()
        expect(clerkOrg()).toBeUndefined()
        expect(fake.orgs.size).toBe(0)
    })

    it('removes the membership when the row is deleted before the hook runs', async () => {
        const { fake, org, user, clerkOrg } = await setup()
        await syncMembershipToClerk({ userId: user.id, orgId: org.id })
        const hooks: (() => Promise<unknown>)[] = []
        await localStorageContext.run({ afterCommit: (hook) => hooks.push(hook) }, () =>
            syncMembershipToClerk({ userId: user.id, orgId: org.id }),
        )
        await db.deleteFrom('orgUser').where('userId', '=', user.id).execute()
        for (const hook of hooks) await hook()
        expect(fake.members.get(clerkOrg()!.id)?.has(user.clerkId)).toBe(false)
    })

    it.each([{ ENVIRONMENT_ID: 'local' }, { ENVIRONMENT_ID: 'dev', DEPLOY_ID: 'pr123' }])(
        'makes no Clerk call when org sync is off (%o)',
        async (env) => {
            for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
            onTestFinished(() => {
                vi.unstubAllEnvs()
            })
            const { fake, org, user } = await setup()

            await syncOrgToClerk(org.slug)
            await deleteOrgFromClerk(org.slug)
            await syncMembershipToClerk({ userId: user.id, orgId: org.id })
            await removeMembershipFromClerk({ userId: user.id, orgId: org.id })

            for (const call of Object.values(fake.api)) expect(call).not.toHaveBeenCalled()
        },
    )
})
