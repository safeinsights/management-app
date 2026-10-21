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

    it('keeps other metadata keys through a rename and a type change', async () => {
        const { fake, sync } = setup()
        const created = await sync.syncOrg(org, { createdBy: 'user_admin' })
        await fake.api.updateOrganizationMetadata(created.id, { publicMetadata: { other: { a: 1 } } })
        await sync.syncOrg({ ...org, name: 'Acme 2', type: 'enclave' }, { createdBy: 'user_admin' })
        expect(fake.orgs.get(created.id)).toMatchObject({
            name: 'Acme 2',
            publicMetadata: { type: 'enclave', other: { a: 1 } },
        })
        expect(fake.api.updateOrganizationMetadata).toHaveBeenCalledWith(created.id, {
            publicMetadata: { type: 'enclave' },
        })
    })

    it('adopts an org created by a concurrent sync without removing its creator', async () => {
        const { fake, sync } = setup()
        const other = await fake.api.createOrganization({
            ...org,
            createdBy: 'user_other',
            publicMetadata: { type: 'lab' },
        })
        fake.api.getOrganization.mockRejectedValueOnce(clerkNotFoundError())
        const result = await sync.syncOrg(org, { createdBy: 'user_admin' })
        expect(result.id).toBe(other.id)
        expect(fake.orgs.size).toBe(1)
        expect(fake.members.get(other.id)?.get('user_other')).toBe('org:admin')
        expect(fake.api.deleteOrganizationMembership).not.toHaveBeenCalled()
    })

    it('throws other create errors', async () => {
        const { fake, sync } = setup()
        fake.api.createOrganization.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }))
        await expect(sync.syncOrg(org, { createdBy: 'user_admin' })).rejects.toThrow('boom')
    })

    it('leaves the creator an admin when removing the creator fails', async () => {
        const { fake, sync } = setup()
        fake.api.deleteOrganizationMembership.mockRejectedValueOnce(
            Object.assign(new Error('last admin'), { status: 403 }),
        )
        await expect(sync.syncOrg(org, { createdBy: 'user_admin' })).rejects.toThrow('last admin')
        const [created] = [...fake.orgs.values()]
        expect(created.slug).toBe('acme')
        expect(fake.members.get(created.id)?.get('user_admin')).toBe('org:admin')
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
