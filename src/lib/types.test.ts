import { describe, it, expect } from 'vitest'
import { getLabOrg, type UserSession } from '@/lib/types'
import { mockSessionWithTestData } from '@/tests/unit.helpers'

describe('getLabOrg helper', () => {
    it('returns null when user has only enclave orgs', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })

        const session: UserSession = {
            user: {
                id: user.id,
                clerkUserId: user.clerkId,
                isSiAdmin: false,
            },
            orgs: {
                [org.slug]: {
                    id: org.id,
                    slug: org.slug,
                    type: 'enclave',
                    isAdmin: false,
                },
            },
        }

        const labOrg = getLabOrg(session)
        expect(labOrg).toBeNull()
    })

    it('returns lab org when user has lab org', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'lab' })

        const session: UserSession = {
            user: {
                id: user.id,
                clerkUserId: user.clerkId,
                isSiAdmin: false,
            },
            orgs: {
                [org.slug]: {
                    id: org.id,
                    slug: org.slug,
                    type: 'lab',
                    isAdmin: false,
                },
            },
        }

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

        const session: UserSession = {
            user: {
                id: user1.id,
                clerkUserId: user1.clerkId,
                isSiAdmin: false,
            },
            orgs: {
                [enclaveOrg.slug]: {
                    id: enclaveOrg.id,
                    slug: enclaveOrg.slug,
                    type: 'enclave',
                    isAdmin: false,
                },
                [labOrg.slug]: {
                    id: labOrg.id,
                    slug: labOrg.slug,
                    type: 'lab',
                    isAdmin: false,
                },
            },
        }

        const foundLabOrg = getLabOrg(session)
        expect(foundLabOrg).not.toBeNull()
        expect(foundLabOrg?.type).toBe('lab')
        expect(foundLabOrg?.slug).toBe(labOrg.slug)
    })
})
