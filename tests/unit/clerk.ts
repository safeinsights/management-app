import { CLERK_ADMIN_ORG_SLUG, UserOrgRoles } from '@/lib/types'
import { useAuth, useClerk, useSession, useUser } from '@clerk/nextjs'
import { auth as clerkAuth, clerkClient, currentUser as currentClerkUser } from '@clerk/nextjs/server'
import { faker } from '@faker-js/faker'
import { useParams } from 'next/navigation'
import { Mock, vi } from 'vitest'
import { BLANK_UUID, testEmail } from './identity'
import { setMockedLayoutUserInfo } from './layout-user-info'

type MockSession = {
    clerkUserId: string
    userId: string
    orgSlug: string
    email?: string
    imageUrl?: string
    firstName?: string
    lastName?: string
    orgId?: string
    roles?: Partial<UserOrgRoles>
    orgType?: 'enclave' | 'lab'
    isSiAdmin?: boolean
    twoFactorEnabled?: boolean
    // Ids must match real DB org ids when the mocked session drives server actions that
    // query by org id.
    extraOrgs?: Array<{ slug: string; id?: string; type?: 'enclave' | 'lab'; isAdmin?: boolean }>
}

export type ClerkMocks = ReturnType<typeof mockClerkSession>

export const mockClerkSession = (values: MockSession | null) => {
    if (values === null) {
        ;(useSession as Mock).mockReturnValue({
            session: null,
            isLoaded: true,
            isSignedIn: false,
        })
        ;(useUser as Mock).mockReturnValue({ isLoaded: true, isSignedIn: false, user: null })
        ;(clerkAuth as unknown as Mock).mockImplementation(() => ({ userId: null, sessionClaims: null }))
        setMockedLayoutUserInfo(null)
        ;(useClerk as Mock).mockReturnValue({
            signOut: vi.fn(),
        } as unknown as ReturnType<typeof useClerk>)
        return
    }

    const client = clerkClient as unknown as Mock
    const user = currentClerkUser as unknown as Mock
    const auth = clerkAuth as unknown as Mock
    const unsafeMetadata = {
        currentOrgSlug: values.orgSlug,
    }
    const orgs: Record<string, Partial<UserOrgRoles> & { id?: string; slug: string; type?: 'enclave' | 'lab' }> = {
        [values.orgSlug]: {
            id: values.orgId,
            slug: values.orgSlug,
            type: values.orgType || 'enclave',
            isAdmin: false,
            ...(values.roles || {}),
        },
    }

    if (values.isSiAdmin) {
        orgs[CLERK_ADMIN_ORG_SLUG] = {
            id: BLANK_UUID,
            slug: CLERK_ADMIN_ORG_SLUG,
            type: 'enclave',
            isAdmin: true,
        }
    }

    for (const extra of values.extraOrgs ?? []) {
        orgs[extra.slug] = {
            id: extra.id,
            slug: extra.slug,
            type: extra.type ?? 'enclave',
            isAdmin: extra.isAdmin ?? false,
        }
    }
    // As in production: the token and Clerk hold no orgs, and the root layout passes them.
    const publicMetadata = { format: 'v3', user: { id: values.userId }, teams: null }
    setMockedLayoutUserInfo({ ...publicMetadata, orgs } as UserInfo)
    const mockEmail = values.email || testEmail()
    const userProperties = {
        id: values.clerkUserId,
        banned: false,
        twoFactorEnabled: values.twoFactorEnabled ?? true,
        imageUrl: values.imageUrl,
        firstName: values.firstName,
        lastName: values.lastName,
        organizationMemberships: [],
        unsafeMetadata,
        publicMetadata,
        primaryEmailAddress: { emailAddress: mockEmail },
    }
    user.mockResolvedValue(userProperties)
    const clientMocks = {
        organizations: {
            getOrganization: vi.fn(async (orgSlug: string) => ({
                slug: orgSlug,
                id: values.orgId || faker.string.alpha(10),
                name: 'Mocked Clerk Org Name by getOrganization',
            })),
            createOrganization: vi.fn(async (org: object) => org),
            createOrganizationMembership: vi.fn(async () => ({ id: '1234' })),
            updateOrganization: vi.fn(),
        },
        users: {
            updateUser: vi.fn(),
            updateUserMetadata: vi.fn(),
            getUserList: vi.fn(async (params: { emailAddress?: string[] }) => {
                if (params.emailAddress && params.emailAddress.length > 0) {
                    return {
                        totalCount: 1,
                        data: [
                            {
                                id: values.clerkUserId,
                                firstName: 'Mocked',
                                lastName: 'User',
                                emailAddresses: [{ emailAddress: params.emailAddress[0] }],
                            },
                        ],
                    }
                }
                return { data: [], totalCount: 0 }
            }),
            getUser: vi.fn(async (clerkId: string) => {
                return {
                    id: clerkId,
                    firstName: 'Mocked',
                    lastName: 'User',
                    emailAddresses: [{ emailAddress: mockEmail }],
                    primaryEmailAddress: { emailAddress: mockEmail },
                }
            }),
            createUser: vi.fn(async () => ({ id: '1234' })),
            deleteUser: vi.fn(async (clerkId: string) => ({ id: clerkId, deleted: true })),
            getOrganizationMembershipList: vi.fn().mockResolvedValue({ data: [] }),
        },
    }
    const useUserReturn = {
        isSignedIn: true,
        isLoaded: true,
        user: userProperties,
    }
    ;(useParams as Mock).mockReturnValue({
        orgSlug: values.orgSlug,
    })
    ;(useUser as Mock).mockReturnValue(useUserReturn)
    client.mockResolvedValue(clientMocks)
    ;(useClerk as Mock).mockReturnValue({
        isLoaded: true,
    })
    ;(useAuth as Mock).mockReturnValue({
        isLoaded: true,
    })
    auth.mockImplementation(() => ({
        orgSlug: values.orgSlug,
        sessionClaims: {
            unsafeMetadata,
            userMetadata: publicMetadata,
        },
        userId: values.clerkUserId,
    }))

    return { client: clientMocks, auth, useUserReturn }
}

type CreateMockUserSessionOptions = {
    user: {
        id: string
        clerkId: string
        isSiAdmin?: boolean
    }
    orgs: Array<{
        id: string
        slug: string
        type: 'enclave' | 'lab'
        isAdmin?: boolean
    }>
}

export const createMockUserSession = (options: CreateMockUserSessionOptions) => {
    const orgsRecord: Record<string, { id: string; slug: string; type: 'enclave' | 'lab'; isAdmin: boolean }> = {}

    for (const org of options.orgs) {
        orgsRecord[org.slug] = {
            id: org.id,
            slug: org.slug,
            type: org.type,
            isAdmin: org.isAdmin ?? false,
        }
    }

    return {
        user: {
            id: options.user.id,
            clerkUserId: options.user.clerkId,
            isSiAdmin: options.user.isSiAdmin ?? false,
        },
        orgs: orgsRecord,
    }
}
