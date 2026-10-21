// A copy lives in the utils repo (utils/lib/clerk-orgs.ts); keep the two in sync.
export type SyncOrg = { slug: string; name: string; type: string }
export type OrgRole = 'org:admin' | 'org:member'

type ClerkOrg = { id: string; name: string; publicMetadata?: Record<string, unknown> | null }

export interface ClerkOrgApi {
    getOrganization(params: { slug: string }): Promise<ClerkOrg>
    createOrganization(params: {
        name: string
        slug: string
        createdBy: string
        publicMetadata: Record<string, unknown>
    }): Promise<ClerkOrg>
    updateOrganization(
        id: string,
        params: { name?: string; publicMetadata?: Record<string, unknown> },
    ): Promise<ClerkOrg>
    deleteOrganization(id: string): Promise<unknown>
    createOrganizationMembership(params: { organizationId: string; userId: string; role: string }): Promise<unknown>
    updateOrganizationMembership(params: { organizationId: string; userId: string; role: string }): Promise<unknown>
    deleteOrganizationMembership(params: { organizationId: string; userId: string }): Promise<unknown>
}

export const clerkRoleFor = (isAdmin: boolean): OrgRole => (isAdmin ? 'org:admin' : 'org:member')

export function isClerkNotFoundError(error: unknown): boolean {
    const e = error as { status?: number; errors?: { code?: string }[] } | null
    return e?.status === 404 || e?.errors?.[0]?.code === 'resource_not_found'
}

const ignoreNotFound = async (call: Promise<unknown>) => {
    try {
        await call
    } catch (error) {
        if (!isClerkNotFoundError(error)) throw error
    }
}

export function createClerkOrgSync(api: ClerkOrgApi) {
    const find = async (slug: string) => {
        try {
            return await api.getOrganization({ slug })
        } catch (error) {
            if (isClerkNotFoundError(error)) return null
            throw error
        }
    }

    // Clerk makes the creator an admin member; the DB has no such row unless keepCreator says so.
    async function syncOrg(
        org: SyncOrg,
        { createdBy, keepCreator = false }: { createdBy: string; keepCreator?: boolean },
    ) {
        const existing = await find(org.slug)
        if (!existing) {
            const created = await api.createOrganization({
                name: org.name,
                slug: org.slug,
                createdBy,
                publicMetadata: { type: org.type },
            })
            if (!keepCreator) {
                await ignoreNotFound(
                    api.deleteOrganizationMembership({ organizationId: created.id, userId: createdBy }),
                )
            }
            return created
        }
        if (existing.name !== org.name || existing.publicMetadata?.type !== org.type) {
            await api.updateOrganization(existing.id, { name: org.name, publicMetadata: { type: org.type } })
        }
        return existing
    }

    async function deleteOrg(slug: string) {
        const existing = await find(slug)
        if (existing) await ignoreNotFound(api.deleteOrganization(existing.id))
    }

    async function syncMembership(org: SyncOrg, clerkUserId: string, isAdmin: boolean) {
        const clerkOrg = await syncOrg(org, { createdBy: clerkUserId, keepCreator: true })
        const params = { organizationId: clerkOrg.id, userId: clerkUserId, role: clerkRoleFor(isAdmin) }
        try {
            await api.updateOrganizationMembership(params)
        } catch (error) {
            if (!isClerkNotFoundError(error)) throw error
            await api.createOrganizationMembership(params)
        }
    }

    async function removeMembership(slug: string, clerkUserId: string) {
        const clerkOrg = await find(slug)
        if (!clerkOrg) return
        await ignoreNotFound(api.deleteOrganizationMembership({ organizationId: clerkOrg.id, userId: clerkUserId }))
    }

    return { syncOrg, deleteOrg, syncMembership, removeMembership }
}
