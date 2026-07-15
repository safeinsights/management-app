import { describe, it, expect } from 'vitest'
import { getLabOrg, orgNeedsKey, sessionNeedsKey } from '@/lib/types'
import { mockSessionWithTestData, createMockUserSession } from '@/tests/unit.helpers'

describe('orgNeedsKey helper', () => {
    it('returns true for enclave orgs', () => {
        expect(orgNeedsKey({ type: 'enclave' })).toBe(true)
    })

    it('returns true for lab orgs', () => {
        expect(orgNeedsKey({ type: 'lab' })).toBe(true)
    })
})

describe('sessionNeedsKey helper', () => {
    const session = (opts: { isSiAdmin?: boolean; orgs?: { slug: string; type: 'enclave' | 'lab' }[] }) =>
        createMockUserSession({
            user: { id: 'u', clerkId: 'c', isSiAdmin: opts.isSiAdmin },
            orgs: (opts.orgs || []).map((o, i) => ({ id: `org-${i}`, slug: o.slug, type: o.type })),
        })

    it('returns false for null/undefined session', () => {
        expect(sessionNeedsKey(null)).toBe(false)
        expect(sessionNeedsKey(undefined)).toBe(false)
    })

    it('returns true for a member of a key-holding org', () => {
        expect(sessionNeedsKey(session({ orgs: [{ slug: 'lab', type: 'lab' }] }))).toBe(true)
    })

    it('requires a key for SI admins even with no key-holding org membership', () => {
        expect(sessionNeedsKey(session({ isSiAdmin: true, orgs: [] }))).toBe(true)
    })

    it('returns false for a non-admin with no orgs', () => {
        expect(sessionNeedsKey(session({ orgs: [] }))).toBe(false)
    })
})

describe('getLabOrg helper', () => {
    it('returns null when user has only enclave orgs', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })

        const session = createMockUserSession({
            user: { id: user.id, clerkId: user.clerkId },
            orgs: [{ id: org.id, slug: org.slug, type: 'enclave' }],
        })

        const labOrg = getLabOrg(session)
        expect(labOrg).toBeNull()
    })

    it('returns lab org when user has lab org', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'lab' })

        const session = createMockUserSession({
            user: { id: user.id, clerkId: user.clerkId },
            orgs: [{ id: org.id, slug: org.slug, type: 'lab' }],
        })

        const labOrg = getLabOrg(session)
        expect(labOrg).not.toBeNull()
        expect(labOrg?.type).toBe('lab')
        expect(labOrg?.slug).toBe(org.slug)
    })

    it('returns lab org when user has both enclave and lab orgs', async () => {
        const { user: user1, org: enclaveOrg } = await mockSessionWithTestData({
            orgSlug: 'enclave-org',
            orgType: 'enclave',
        })
        const { org: labOrg } = await mockSessionWithTestData({ orgSlug: 'lab-org', orgType: 'lab' })

        const session = createMockUserSession({
            user: { id: user1.id, clerkId: user1.clerkId },
            orgs: [
                { id: enclaveOrg.id, slug: enclaveOrg.slug, type: 'enclave' },
                { id: labOrg.id, slug: labOrg.slug, type: 'lab' },
            ],
        })

        const foundLabOrg = getLabOrg(session)
        expect(foundLabOrg).not.toBeNull()
        expect(foundLabOrg?.type).toBe('lab')
        expect(foundLabOrg?.slug).toBe(labOrg.slug)
    })
})
