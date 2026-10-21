// In-memory Clerk organizations API, shared by the e2e Clerk fake and the unit-test fake.

export type FakeClerkOrg = { id: string; slug: string; name: string; publicMetadata: Record<string, unknown> }

type MembershipParams = { organizationId: string; userId: string; role: string }

export const clerkNotFoundError = () =>
    Object.assign(new Error('not found'), { status: 404, errors: [{ code: 'resource_not_found' }] })

export function createFakeOrganizations() {
    const orgs = new Map<string, FakeClerkOrg>()
    const members = new Map<string, Map<string, string>>()

    const membersOf = (organizationId: string) => {
        const m = members.get(organizationId)
        if (!m) throw clerkNotFoundError()
        return m
    }

    const api = {
        getOrganization: async ({ slug }: { slug: string }) => {
            const org = [...orgs.values()].find((o) => o.slug === slug)
            if (!org) throw clerkNotFoundError()
            return org
        },
        createOrganization: async (p: {
            name: string
            slug: string
            createdBy: string
            publicMetadata?: Record<string, unknown>
        }) => {
            const org = {
                id: `org_${crypto.randomUUID()}`,
                slug: p.slug,
                name: p.name,
                publicMetadata: p.publicMetadata ?? {},
            }
            orgs.set(org.id, org)
            members.set(org.id, new Map([[p.createdBy, 'org:admin']]))
            return org
        },
        updateOrganization: async (id: string, p: { name?: string; publicMetadata?: Record<string, unknown> }) => {
            const org = orgs.get(id)
            if (!org) throw clerkNotFoundError()
            if (p.name) org.name = p.name
            if (p.publicMetadata) org.publicMetadata = p.publicMetadata
            return org
        },
        deleteOrganization: async (id: string) => {
            if (!orgs.delete(id)) throw clerkNotFoundError()
            members.delete(id)
        },
        createOrganizationMembership: async (p: MembershipParams) => {
            membersOf(p.organizationId).set(p.userId, p.role)
        },
        updateOrganizationMembership: async (p: MembershipParams) => {
            const m = membersOf(p.organizationId)
            if (!m.has(p.userId)) throw clerkNotFoundError()
            m.set(p.userId, p.role)
        },
        deleteOrganizationMembership: async (p: { organizationId: string; userId: string }) => {
            if (!membersOf(p.organizationId).delete(p.userId)) throw clerkNotFoundError()
        },
        getOrganizationMembershipList: async (p: { organizationId: string }) => {
            const m = membersOf(p.organizationId)
            return {
                data: [...m].map(([userId, role]) => ({ role, publicUserData: { userId } })),
                totalCount: m.size,
            }
        },
    }

    return { api, orgs, members }
}
