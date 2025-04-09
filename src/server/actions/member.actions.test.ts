import { describe, expect, it, beforeEach } from 'vitest'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { db } from '@/database'
import { mockClerkSession } from '@/tests/unit.helpers'
import { Member } from '@/schema/member'
import { deleteMemberAction, fetchMembersAction, getMemberFromSlugAction, upsertMemberAction } from './member.actions'

describe('Member Actions', () => {
    beforeEach(() => {
        mockClerkSession({
            clerkUserId: 'user-id',
            org_slug: CLERK_ADMIN_ORG_SLUG,
        })
    })
    const newMember = {
        slug: 'new-org',
        name: 'A Testing Org',
        email: 'new-org@example.com',
        publicKey: 'no-such-key',
    }

    beforeEach(async () => {
        await upsertMemberAction(newMember)
    })

    describe('upsertMemberAction', () => {
        it('successfully inserts a new member', async () => {
            const member = await db
                .selectFrom('member')
                .selectAll()
                .where('slug', '=', newMember.slug)
                .executeTakeFirst()
            expect(member).toMatchObject(newMember)
        })

        it('throws error when duplicate organization name exists for new member', async () => {
            // was inserted in beforeEach, should throw on dupe insert
            await expect(upsertMemberAction(newMember)).rejects.toThrow('Organization with this name already exists')
        })

        it('throws error with malformed input', async () => {
            await expect(upsertMemberAction({ name: 'bob' } as unknown as Member)).rejects.toThrow()
        })
    })

    describe('fetchMembersAction', () => {
        it('returns members', async () => {
            const result = await fetchMembersAction()
            expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ slug: 'new-org' })]))
        })
    })

    describe('deleteMemberAction', () => {
        it('deletes member by slug', async () => {
            await deleteMemberAction(newMember.slug)
            const result = await fetchMembersAction()
            expect(result).not.toEqual(expect.arrayContaining([expect.objectContaining({ slug: 'new-org' })]))
        })
    })

    describe('getMemberFromSlug', () => {
        it('returns member when found', async () => {
            const result = await getMemberFromSlugAction(newMember.slug)
            expect(result).toMatchObject(newMember)
        })

        it('returns undefined when member not found', async () => {
            const result = await getMemberFromSlugAction('non-existent')
            expect(result).toBeUndefined()
        })
    })
})
