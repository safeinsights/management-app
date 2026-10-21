import { clerkClient } from '@clerk/nextjs/server'
import { faker } from '@faker-js/faker'
import { Mock, vi } from 'vitest'

type FakeOrg = { id: string; slug: string; name: string; publicMetadata: Record<string, unknown> }

const notFound = () => Object.assign(new Error('not found'), { status: 404, errors: [{ code: 'resource_not_found' }] })

export const createFakeClerkOrgs = () => {
    const orgs = new Map<string, FakeOrg>()
    const members = new Map<string, Map<string, string>>()
    const membersOf = (organizationId: string) => {
        if (!orgs.has(organizationId)) throw notFound()
        return members.get(organizationId)!
    }

    const api = {
        getOrganization: vi.fn(async ({ slug }: { slug: string }) => {
            const org = [...orgs.values()].find((o) => o.slug === slug)
            if (!org) throw notFound()
            return org
        }),
        createOrganization: vi.fn(
            async (p: { name: string; slug: string; createdBy: string; publicMetadata: Record<string, unknown> }) => {
                const org = {
                    id: `org_${faker.string.alphanumeric(12)}`,
                    slug: p.slug,
                    name: p.name,
                    publicMetadata: p.publicMetadata,
                }
                orgs.set(org.id, org)
                members.set(org.id, new Map([[p.createdBy, 'org:admin']]))
                return org
            },
        ),
        updateOrganization: vi.fn(
            async (id: string, p: { name?: string; publicMetadata?: Record<string, unknown> }) => {
                const org = orgs.get(id)
                if (!org) throw notFound()
                Object.assign(
                    org,
                    p.name ? { name: p.name } : {},
                    p.publicMetadata ? { publicMetadata: p.publicMetadata } : {},
                )
                return org
            },
        ),
        deleteOrganization: vi.fn(async (id: string) => {
            if (!orgs.delete(id)) throw notFound()
            members.delete(id)
        }),
        createOrganizationMembership: vi.fn(async (p: { organizationId: string; userId: string; role: string }) => {
            membersOf(p.organizationId).set(p.userId, p.role)
        }),
        updateOrganizationMembership: vi.fn(async (p: { organizationId: string; userId: string; role: string }) => {
            const m = membersOf(p.organizationId)
            if (!m.has(p.userId)) throw notFound()
            m.set(p.userId, p.role)
        }),
        deleteOrganizationMembership: vi.fn(async (p: { organizationId: string; userId: string }) => {
            if (!membersOf(p.organizationId).delete(p.userId)) throw notFound()
        }),
        getOrganizationMembershipList: vi.fn(async (p: { organizationId: string }) => ({
            data: [...membersOf(p.organizationId)].map(([userId, role]) => ({ role, publicUserData: { userId } })),
            totalCount: membersOf(p.organizationId).size,
        })),
    }
    return { api, orgs, members }
}

export const installFakeClerkOrgs = () => {
    const fake = createFakeClerkOrgs()
    ;(clerkClient as unknown as Mock).mockResolvedValue({ organizations: fake.api })
    return fake
}
