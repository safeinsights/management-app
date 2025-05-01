import { describe, expect, it, beforeEach } from 'vitest'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { db } from '@/database'
import { mockClerkSession } from '@/tests/unit.helpers'
import { Org } from '@/schema/org'
import { deleteOrgAction, fetchOrgsAction, getOrgFromSlugAction, upsertOrgAction } from './org.actions'

describe('Org Actions', () => {
    beforeEach(() => {
        mockClerkSession({
            clerkUserId: 'user-id',
            org_slug: CLERK_ADMIN_ORG_SLUG,
        })
    })
    const newOrg = {
        slug: 'new-org',
        name: 'A Testing Org',
        email: 'new-org@example.com',
        publicKey: 'no-such-key',
    }

    beforeEach(async () => {
        await upsertOrgAction(newOrg)
    })

    describe('upsertOrgAction', () => {
        it('successfully inserts a new org', async () => {
            const org = await db
                .selectFrom('org')
                .selectAll()
                .where('slug', '=', newOrg.slug)
                .executeTakeFirst()
            expect(org).toMatchObject(newOrg)
        })

        it('throws error when duplicate organization name exists for new org', async () => {
            // was inserted in beforeEach, should throw on dupe insert
            await expect(upsertOrgAction(newOrg)).rejects.toThrow('Organization with this name already exists')
        })

        it('throws error with malformed input', async () => {
            await expect(upsertOrgAction({ name: 'bob' } as unknown as Org)).rejects.toThrow()
        })
    })

    describe('fetchOrgsAction', () => {
        it('returns orgs', async () => {
            const result = await fetchOrgsAction()
            expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ slug: 'new-org' })]))
        })
    })

    describe('deleteOrgAction', () => {
        it('deletes org by slug', async () => {
            await deleteOrgAction(newOrg.slug)
            const result = await fetchOrgsAction()
            expect(result).not.toEqual(expect.arrayContaining([expect.objectContaining({ slug: 'new-org' })]))
        })
    })

    describe('getOrgFromSlug', () => {
        it('returns org when found', async () => {
            const result = await getOrgFromSlugAction(newOrg.slug)
            expect(result).toMatchObject(newOrg)
        })

        it('throws when org not found', async () => {
            await expect(getOrgFromSlugAction('non-existent')).rejects.toThrow('Org not found')
        })
    })
})
