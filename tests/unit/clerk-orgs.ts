import { clerkClient } from '@clerk/nextjs/server'
import { Mock, onTestFinished, vi } from 'vitest'
import { createFakeOrganizations } from '@/lib/clerk-fake/organizations'

export const createFakeClerkOrgs = () => {
    const { api, orgs, members } = createFakeOrganizations()
    return {
        api: {
            getOrganization: vi.fn(api.getOrganization),
            createOrganization: vi.fn(api.createOrganization),
            updateOrganization: vi.fn(api.updateOrganization),
            updateOrganizationMetadata: vi.fn(api.updateOrganizationMetadata),
            deleteOrganization: vi.fn(api.deleteOrganization),
            createOrganizationMembership: vi.fn(api.createOrganizationMembership),
            updateOrganizationMembership: vi.fn(api.updateOrganizationMembership),
            deleteOrganizationMembership: vi.fn(api.deleteOrganizationMembership),
            getOrganizationMembershipList: vi.fn(api.getOrganizationMembershipList),
        },
        orgs,
        members,
    }
}

export const installFakeClerkOrgs = () => {
    const fake = createFakeClerkOrgs()
    ;(clerkClient as unknown as Mock).mockResolvedValue({ organizations: fake.api })
    return fake
}

export const currentFakeClerkOrgsApi = async () =>
    (await clerkClient()).organizations as unknown as ReturnType<typeof createFakeClerkOrgs>['api']

export const fakeClerkRoleOf = async (slug: string, clerkUserId: string) => {
    const api = await currentFakeClerkOrgsApi()
    const org = await api.getOrganization({ slug })
    const { data } = await api.getOrganizationMembershipList({ organizationId: org.id })
    return data.find((m) => m.publicUserData.userId === clerkUserId)?.role
}

// clerkOrgSyncEnabled() is off for an unset (local) ENVIRONMENT_ID. Not stubbed for every test: one
// that resets modules would re-read the config.ts constants with it and turn on DB SSL.
export const enableClerkOrgSync = () => {
    vi.stubEnv('ENVIRONMENT_ID', 'test')
    onTestFinished(() => {
        vi.unstubAllEnvs()
    })
}
