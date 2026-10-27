// A copy lives in the utils repo (utils/lib/clerk-orgs.ts); keep the two in sync.
export type SyncOrg = { slug: string; name: string; type: string }
export type OrgRole = 'org:admin' | 'org:member'

type ClerkOrg = {
    id: string
    name: string
    maxAllowedMemberships: number
    publicMetadata?: Record<string, unknown> | null
}

export interface ClerkOrgApi {
    getOrganization(params: { slug: string }): Promise<ClerkOrg>
    createOrganization(params: {
        name: string
        slug: string
        maxAllowedMemberships: number
        publicMetadata: Record<string, unknown>
    }): Promise<ClerkOrg>
    updateOrganization(id: string, params: { name?: string; maxAllowedMemberships?: number }): Promise<ClerkOrg>
    updateOrganizationMetadata(id: string, params: { publicMetadata?: Record<string, unknown> }): Promise<ClerkOrg>
    deleteOrganization(id: string): Promise<unknown>
    createOrganizationMembership(params: { organizationId: string; userId: string; role: string }): Promise<unknown>
    updateOrganizationMembership(params: { organizationId: string; userId: string; role: string }): Promise<unknown>
    deleteOrganizationMembership(params: { organizationId: string; userId: string }): Promise<unknown>
}

// Clerk's default cap is 5 members per org; 0 means no cap.
export const UNLIMITED_MEMBERSHIPS = 0

export const clerkRoleFor = (isAdmin: boolean): OrgRole => (isAdmin ? 'org:admin' : 'org:member')

const clerkErrorCode = (error: unknown) => (error as { errors?: { code?: string }[] } | null)?.errors?.[0]?.code

export const isClerkDuplicateSlugError = (error: unknown) => clerkErrorCode(error) === 'form_identifier_exists'

export function isClerkNotFoundError(error: unknown): boolean {
    return (error as { status?: number } | null)?.status === 404 || clerkErrorCode(error) === 'resource_not_found'
}

const isClerkNotMemberError = (error: unknown) =>
    isClerkNotFoundError(error) || clerkErrorCode(error) === 'not_a_member_in_organization'

const isClerkAlreadyMemberError = (error: unknown) => clerkErrorCode(error) === 'already_a_member_in_organization'

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
    async function findOrCreateOrg(org: SyncOrg) {
        const existing = await find(org.slug)
        if (existing) return existing
        try {
            return await api.createOrganization({
                name: org.name,
                slug: org.slug,
                maxAllowedMemberships: UNLIMITED_MEMBERSHIPS,
                publicMetadata: { type: org.type },
            })
        } catch (error) {
            // A concurrent sync created it first.
            if (!isClerkDuplicateSlugError(error)) throw error
            return await api.getOrganization({ slug: org.slug })
        }
    }

    async function syncOrg(org: SyncOrg) {
        const existing = await findOrCreateOrg(org)
        if (existing.name !== org.name || existing.maxAllowedMemberships !== UNLIMITED_MEMBERSHIPS) {
            await api.updateOrganization(existing.id, {
                name: org.name,
                maxAllowedMemberships: UNLIMITED_MEMBERSHIPS,
            })
        }
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
        const clerkOrg = await findOrCreateOrg(org)
        const params = { organizationId: clerkOrg.id, userId: clerkUserId, role: clerkRoleFor(isAdmin) }
        try {
            await api.updateOrganizationMembership(params)
            return
        } catch (error) {
            if (!isClerkNotMemberError(error)) throw error
        }
        try {
            await api.createOrganizationMembership(params)
        } catch (error) {
            // A concurrent sync added the member first.
            if (!isClerkAlreadyMemberError(error)) throw error
            await api.updateOrganizationMembership(params)
        }
    }

    async function removeMembership(slug: string, clerkUserId: string) {
        const clerkOrg = await find(slug)
        if (!clerkOrg) return
        await ignoreNotFound(api.deleteOrganizationMembership({ organizationId: clerkOrg.id, userId: clerkUserId }))
    }

    return { syncOrg, deleteOrg, syncMembership, removeMembership }
}
