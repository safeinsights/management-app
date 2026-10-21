// In-memory Clerk organizations API, shared by the e2e Clerk fake and the unit-test fake.

export type FakeClerkOrg = { id: string; slug: string; name: string; publicMetadata: Record<string, unknown> }

type MembershipParams = { organizationId: string; userId: string; role: string }

export const clerkNotFoundError = () =>
    Object.assign(new Error('not found'), { status: 404, errors: [{ code: 'resource_not_found' }] })

export const clerkDuplicateSlugError = () =>
    Object.assign(new Error('That slug is taken. Please try another.'), {
        status: 422,
        errors: [{ code: 'form_identifier_exists', message: 'That slug is taken. Please try another.' }],
    })

const mergeDeep = (target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> => {
    const out = { ...target }
    for (const [key, value] of Object.entries(patch)) {
        const current = out[key]
        const bothObjects =
            value && typeof value === 'object' && !Array.isArray(value) && current && typeof current === 'object'
        out[key] = bothObjects ? mergeDeep(current as Record<string, unknown>, value as Record<string, unknown>) : value
    }
    return out
}

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
            createdBy?: string
            publicMetadata?: Record<string, unknown>
        }) => {
            if ([...orgs.values()].some((o) => o.slug === p.slug)) throw clerkDuplicateSlugError()
            const org = {
                id: `org_${crypto.randomUUID()}`,
                slug: p.slug,
                name: p.name,
                publicMetadata: p.publicMetadata ?? {},
            }
            orgs.set(org.id, org)
            members.set(org.id, new Map(p.createdBy ? [[p.createdBy, 'org:admin']] : []))
            return org
        },
        // The real endpoint also accepts publicMetadata (replacing it); the app no longer sends it.
        updateOrganization: async (id: string, p: { name?: string; publicMetadata?: Record<string, unknown> }) => {
            const org = orgs.get(id)
            if (!org) throw clerkNotFoundError()
            if (p.name) org.name = p.name
            if (p.publicMetadata) org.publicMetadata = p.publicMetadata
            return org
        },
        updateOrganizationMetadata: async (id: string, p: { publicMetadata?: Record<string, unknown> }) => {
            const org = orgs.get(id)
            if (!org) throw clerkNotFoundError()
            if (p.publicMetadata) org.publicMetadata = mergeDeep(org.publicMetadata, p.publicMetadata)
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
