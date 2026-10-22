// A copy lives in the utils repo (utils/lib/clerk-orgs.ts); keep the two in sync.
export type SyncOrg = { slug: string; name: string; type: string }
export type OrgRole = 'org:admin' | 'org:member'

type ClerkOrg = { id: string; name: string; publicMetadata?: Record<string, unknown> | null }

export interface ClerkOrgApi {
    getOrganization(params: { slug: string }): Promise<ClerkOrg>
    createOrganization(params: {
        name: string
        slug: string
        publicMetadata: Record<string, unknown>
    }): Promise<ClerkOrg>
    updateOrganization(id: string, params: { name?: string }): Promise<ClerkOrg>
    updateOrganizationMetadata(id: string, params: { publicMetadata?: Record<string, unknown> }): Promise<ClerkOrg>
    deleteOrganization(id: string): Promise<unknown>
    createOrganizationMembership(params: { organizationId: string; userId: string; role: string }): Promise<unknown>
    updateOrganizationMembership(params: { organizationId: string; userId: string; role: string }): Promise<unknown>
    deleteOrganizationMembership(params: { organizationId: string; userId: string }): Promise<unknown>
}

export const clerkRoleFor = (isAdmin: boolean): OrgRole => (isAdmin ? 'org:admin' : 'org:member')

export function isClerkDuplicateSlugError(error: unknown): boolean {
    const e = error as { errors?: { code?: string }[] } | null
    return e?.errors?.[0]?.code === 'form_identifier_exists'
}

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

    // No createdBy: the app never makes the creating user a member, and Clerk would add them as admin.
    // App-side member removal must keep at least one admin and forbid self-removal, as Clerk does.
    async function syncOrg(org: SyncOrg) {
        let existing = await find(org.slug)
        if (!existing) {
            try {
                return await api.createOrganization({
                    name: org.name,
                    slug: org.slug,
                    publicMetadata: { type: org.type },
                })
            } catch (error) {
                // A concurrent sync created it first.
                if (!isClerkDuplicateSlugError(error)) throw error
                existing = await api.getOrganization({ slug: org.slug })
            }
        }
        if (existing.name !== org.name) await api.updateOrganization(existing.id, { name: org.name })
        if (existing.publicMetadata?.type !== org.type) {
            await api.updateOrganizationMetadata(existing.id, { publicMetadata: { type: org.type } })
        }
        return existing
    }

    async function deleteOrg(slug: string) {
        const existing = await find(slug)
        if (existing) await ignoreNotFound(api.deleteOrganization(existing.id))
    }

    async function syncMembership(org: SyncOrg, clerkUserId: string, isAdmin: boolean) {
        const clerkOrg = await syncOrg(org)
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
