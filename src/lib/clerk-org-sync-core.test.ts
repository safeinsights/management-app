import { describe, expect, it } from 'vitest'
import { createFakeClerkOrgs } from '@/tests/unit.helpers'
import { clerkRoleFor, createClerkOrgSync } from './clerk-org-sync-core'

const org = { slug: 'acme', name: 'Acme', type: 'lab' }

const setup = () => {
    const fake = createFakeClerkOrgs()
    return { fake, sync: createClerkOrgSync(fake.api) }
}

describe('clerkRoleFor', () => {
    it('maps admin and member', () => {
        expect(clerkRoleFor(true)).toBe('org:admin')
        expect(clerkRoleFor(false)).toBe('org:member')
    })
})

describe('syncOrg', () => {
    it('creates the org with type metadata and removes the creator', async () => {
        const { fake, sync } = setup()
        const created = await sync.syncOrg(org, { createdBy: 'user_admin' })
        expect(fake.orgs.get(created.id)).toMatchObject({ slug: 'acme', name: 'Acme', publicMetadata: { type: 'lab' } })
        expect(fake.members.get(created.id)?.size).toBe(0)
    })

    it('updates a renamed org and is a no-op when repeated', async () => {
        const { fake, sync } = setup()
        await sync.syncOrg(org, { createdBy: 'user_admin' })
        await sync.syncOrg({ ...org, name: 'Acme 2' }, { createdBy: 'user_admin' })
        expect(fake.api.updateOrganization).toHaveBeenCalledTimes(1)
        await sync.syncOrg({ ...org, name: 'Acme 2' }, { createdBy: 'user_admin' })
        expect(fake.api.updateOrganization).toHaveBeenCalledTimes(1)
        expect(fake.api.createOrganization).toHaveBeenCalledTimes(1)
    })
})

describe('deleteOrg', () => {
    it('deletes, and a repeat does nothing', async () => {
        const { fake, sync } = setup()
        await sync.syncOrg(org, { createdBy: 'user_admin' })
        await sync.deleteOrg('acme')
        await sync.deleteOrg('acme')
        expect(fake.orgs.size).toBe(0)
        expect(fake.api.deleteOrganization).toHaveBeenCalledTimes(1)
    })
})

describe('syncMembership', () => {
    it('creates the org when it is missing and gives the member the right role', async () => {
        const { fake, sync } = setup()
        await sync.syncMembership(org, 'user_1', false)
        const [clerkOrg] = [...fake.orgs.values()]
        expect(fake.members.get(clerkOrg.id)?.get('user_1')).toBe('org:member')
    })

    it('changes the role and leaves the state unchanged on repeat', async () => {
        const { fake, sync } = setup()
        await sync.syncOrg(org, { createdBy: 'user_admin' })
        await sync.syncMembership(org, 'user_1', false)
        await sync.syncMembership(org, 'user_1', true)
        const [clerkOrg] = [...fake.orgs.values()]
        expect(fake.members.get(clerkOrg.id)?.get('user_1')).toBe('org:admin')
        await sync.syncMembership(org, 'user_1', true)
        expect(fake.members.get(clerkOrg.id)?.size).toBe(1)
    })

    it('throws when Clerk fails', async () => {
        const { fake, sync } = setup()
        fake.api.getOrganization.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }))
        await expect(sync.syncMembership(org, 'user_1', false)).rejects.toThrow('boom')
    })
})

describe('removeMembership', () => {
    it('removes, and a repeat or a missing org does nothing', async () => {
        const { fake, sync } = setup()
        await sync.syncMembership(org, 'user_1', false)
        await sync.removeMembership('acme', 'user_1')
        await sync.removeMembership('acme', 'user_1')
        await sync.removeMembership('no-such-org', 'user_1')
        const [clerkOrg] = [...fake.orgs.values()]
        expect(fake.members.get(clerkOrg.id)?.size).toBe(0)
    })
})
