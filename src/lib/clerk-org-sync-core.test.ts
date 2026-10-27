import { describe, expect, it } from 'vitest'
import { clerkNotFoundError } from '@/lib/clerk-fake/organizations'
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
    it('creates the org with type metadata and no creator, leaving it with no members', async () => {
        const { fake, sync } = setup()
        const created = await sync.syncOrg(org)
        expect(fake.api.createOrganization).toHaveBeenCalledWith({
            name: 'Acme',
            slug: 'acme',
            maxAllowedMemberships: 0,
            publicMetadata: { type: 'lab' },
        })
        expect(fake.api.createOrganization.mock.calls[0][0]).not.toHaveProperty('createdBy')
        expect(fake.orgs.get(created.id)).toMatchObject({ slug: 'acme', name: 'Acme', publicMetadata: { type: 'lab' } })
        expect(fake.members.get(created.id)?.size).toBe(0)
    })

    it('updates a renamed org and is a no-op when repeated', async () => {
        const { fake, sync } = setup()
        await sync.syncOrg(org)
        await sync.syncOrg({ ...org, name: 'Acme 2' })
        expect(fake.api.updateOrganization).toHaveBeenCalledTimes(1)
        await sync.syncOrg({ ...org, name: 'Acme 2' })
        expect(fake.api.updateOrganization).toHaveBeenCalledTimes(1)
        expect(fake.api.createOrganization).toHaveBeenCalledTimes(1)
    })

    it('lifts the member cap on an org created with the default', async () => {
        const { fake, sync } = setup()
        const capped = await fake.api.createOrganization({ ...org, publicMetadata: { type: 'lab' } })
        await sync.syncOrg(org)
        expect(fake.orgs.get(capped.id)?.maxAllowedMemberships).toBe(0)
    })

    it('keeps other metadata keys through a rename and a type change', async () => {
        const { fake, sync } = setup()
        const created = await sync.syncOrg(org)
        await fake.api.updateOrganizationMetadata(created.id, { publicMetadata: { other: { a: 1 } } })
        await sync.syncOrg({ ...org, name: 'Acme 2', type: 'enclave' })
        expect(fake.orgs.get(created.id)).toMatchObject({
            name: 'Acme 2',
            publicMetadata: { type: 'enclave', other: { a: 1 } },
        })
        expect(fake.api.updateOrganizationMetadata).toHaveBeenCalledWith(created.id, {
            publicMetadata: { type: 'enclave' },
        })
    })

    it('adopts an org created by a concurrent sync without touching its members', async () => {
        const { fake, sync } = setup()
        const other = await fake.api.createOrganization({
            ...org,
            createdBy: 'user_other',
            publicMetadata: { type: 'lab' },
        })
        fake.api.getOrganization.mockRejectedValueOnce(clerkNotFoundError())
        const result = await sync.syncOrg(org)
        expect(result.id).toBe(other.id)
        expect(fake.orgs.size).toBe(1)
        expect(fake.members.get(other.id)?.get('user_other')).toBe('org:admin')
        expect(fake.api.deleteOrganizationMembership).not.toHaveBeenCalled()
        expect(fake.api.createOrganizationMembership).not.toHaveBeenCalled()
    })

    it('throws other create errors', async () => {
        const { fake, sync } = setup()
        fake.api.createOrganization.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }))
        await expect(sync.syncOrg(org)).rejects.toThrow('boom')
    })
})

describe('deleteOrg', () => {
    it('deletes, and a repeat does nothing', async () => {
        const { fake, sync } = setup()
        await sync.syncOrg(org)
        await sync.deleteOrg('acme')
        await sync.deleteOrg('acme')
        expect(fake.orgs.size).toBe(0)
        expect(fake.api.deleteOrganization).toHaveBeenCalledTimes(1)
    })
})

describe('syncMembership', () => {
    it.each([
        { isAdmin: false, role: 'org:member' },
        { isAdmin: true, role: 'org:admin' },
    ])('creates a missing org with no creator and one $role member', async ({ isAdmin, role }) => {
        const { fake, sync } = setup()
        await sync.syncMembership(org, 'user_1', isAdmin)
        const [clerkOrg] = [...fake.orgs.values()]
        expect(fake.api.createOrganization.mock.calls[0][0]).not.toHaveProperty('createdBy')
        expect([...fake.members.get(clerkOrg.id)!]).toEqual([['user_1', role]])
    })

    it('changes the role and leaves the state unchanged on repeat', async () => {
        const { fake, sync } = setup()
        await sync.syncOrg(org)
        await sync.syncMembership(org, 'user_1', false)
        await sync.syncMembership(org, 'user_1', true)
        const [clerkOrg] = [...fake.orgs.values()]
        expect(fake.members.get(clerkOrg.id)?.get('user_1')).toBe('org:admin')
        await sync.syncMembership(org, 'user_1', true)
        expect(fake.members.get(clerkOrg.id)?.size).toBe(1)
    })

    it('adds more members than the Clerk default cap of 5', async () => {
        const { fake, sync } = setup()
        for (let i = 0; i < 7; i++) await sync.syncMembership(org, `user_${i}`, false)
        const [clerkOrg] = [...fake.orgs.values()]
        expect(fake.members.get(clerkOrg.id)?.size).toBe(7)
    })

    it('only finds the org, and does not rename it', async () => {
        const { fake, sync } = setup()
        await sync.syncOrg(org)
        await sync.syncMembership({ ...org, name: 'Stale name' }, 'user_1', false)
        expect(fake.api.updateOrganization).not.toHaveBeenCalled()
        expect(fake.api.updateOrganizationMetadata).not.toHaveBeenCalled()
    })

    it('updates the role when a concurrent sync added the member first', async () => {
        const { fake, sync } = setup()
        const clerkOrg = await sync.syncOrg(org)
        fake.api.updateOrganizationMembership.mockImplementationOnce(async (params) => {
            await fake.api.createOrganizationMembership({ ...params, role: 'org:member' })
            throw clerkNotFoundError()
        })
        await sync.syncMembership(org, 'user_1', true)
        expect(fake.members.get(clerkOrg.id)?.get('user_1')).toBe('org:admin')
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
