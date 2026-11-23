import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { getLabOrg, MAX_UPLOAD_FILE_BYTES } from '@/lib/types'
import { mockSessionWithTestData, createMockUserSession } from '@/tests/unit.helpers'

// The cap only holds if next.config still carries a body limit above it: the upload rides a server
// action, and Next rejects an over-limit body before any of our validation runs.
describe('MAX_UPLOAD_FILE_BYTES', () => {
    it('stays under the serverActions body limit next.config sets', () => {
        const config = readFileSync('next.config.ts', 'utf-8')
        const limit = config.match(/bodySizeLimit:\s*'(\d+)mb'/)

        // Asserted before the comparison so a reformat fails here rather than passing vacuously.
        expect(limit).not.toBeNull()
        expect(MAX_UPLOAD_FILE_BYTES).toBeLessThan(Number(limit![1]) * 1024 * 1024)
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
