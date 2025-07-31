import { db } from '@/database'

import fs from 'fs'
import path from 'path'
import os from 'os'
import { faker } from '@faker-js/faker'
import jwt from 'jsonwebtoken'
import { headers } from 'next/headers.js'
import { useParams } from 'next/navigation'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { theme } from '@/theme'
import { ReactElement } from 'react'
import { useClerk, useAuth, useUser } from '@clerk/nextjs'
import { auth as clerkAuth, clerkClient, currentUser as currentClerkUser } from '@clerk/nextjs/server'
import { Mock, vi } from 'vitest'
import { ENVIRONMENT_ID } from '@/server/config'
import { latestJobForStudy } from '@/server/db/queries'
import type { StudyJobStatus, StudyStatus } from '@/database/types'
import { Org } from '@/schema/org'
import { CLERK_ADMIN_ORG_SLUG, UserOrgRoles } from '@/lib/types'
import userEvent from '@testing-library/user-event'

export { userEvent }
export { faker } from '@faker-js/faker'
export { db } from '@/database'
export { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
export { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
export const readTestSupportFile = (file: string) => {
    return fs.promises.readFile(path.join(__dirname, 'support', file), 'utf8')
}

let mockPathname = '/'
vi.mock('next/navigation', () => ({
    useParams: vi.fn(),
    usePathname: () => mockPathname,
}))

export const setMockPathname = (pathname: string) => {
    mockPathname = pathname
}

const createTestQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    })

export function renderWithProviders(ui: ReactElement, options?: Parameters<typeof render>[1]) {
    const testQueryClient = createTestQueryClient()

    return render(
        <QueryClientProvider client={testQueryClient}>
            <MantineProvider theme={theme}>
                <ModalsProvider>{ui}</ModalsProvider>
            </MantineProvider>
        </QueryClientProvider>,
        options,
    )
}

export * from './common.helpers'

export const insertTestStudyData = async ({ org, researcherId }: { org: MinimalTestOrg; researcherId?: string }) => {
    if (!researcherId) {
        const { user } = await insertTestUser({ org })
        researcherId = user.id
    }
    const study = await db
        .insertInto('study')
        .values({
            orgId: org.id,
            containerLocation: 'test-container',
            title: 'my 1st study',
            researcherId: researcherId,
            piName: 'test',
            irbProtocols: 'https://www.google.com',
            status: 'APPROVED',
            dataSources: ['all'],
            outputMimeType: 'text/csv',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    const job0 = await db
        .insertInto('studyJob')
        .values({
            studyId: study.id,
            language: 'R',
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    await db
        .insertInto('jobStatusChange')
        .values({ status: 'INITIATED', studyJobId: job0.id, userId: researcherId })
        .execute()

    const job1 = await db
        .insertInto('studyJob')
        .values({
            studyId: study.id,
            language: 'R',
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    await db
        .insertInto('jobStatusChange')
        .values({ status: 'JOB-RUNNING', studyJobId: job1.id, userId: researcherId })
        .execute()

    const job2 = await db
        .insertInto('studyJob')
        .values({
            studyId: study.id,
            language: 'R',
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    await db
        .insertInto('jobStatusChange')
        .values({ status: 'JOB-READY', studyJobId: job2.id, userId: researcherId })
        .execute()

    return {
        orgId: org.id,
        studyId: study.id,
        jobs: [job0, job1, job2],
        jobIds: [job0.id, job1.id, job2.id],
    }
}

export const insertTestUser = async ({
    org,
    isResearcher = true,
    isReviewer = true,
    isAdmin = false,
}: {
    org: MinimalTestOrg
    isResearcher?: boolean
    isReviewer?: boolean
    isAdmin?: boolean
}) => {
    const user = await db
        .insertInto('user')
        .values({
            clerkId: faker.string.alpha(10),
            firstName: faker.person.firstName(),
            lastName: faker.person.lastName(),
            email: faker.internet.email({ provider: 'test.com' }),
        })
        .returningAll()
        .executeTakeFirstOrThrow()

    // Add users as orgUsers
    const orgUser = await db
        .insertInto('orgUser')
        .values({
            orgId: org.id,
            userId: user.id,
            isResearcher,
            isAdmin,
            isReviewer,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

    if (isReviewer) {
        await db
            .insertInto('userPublicKey')
            .values({
                userId: user.id,
                publicKey: Buffer.from('testPublicKey1'),
                fingerprint: 'testFingerprint1',
            })
            .executeTakeFirstOrThrow()
    }

    return { user, orgUser }
}

type MinimalTestOrg = { slug: string; id: string }

export const insertTestStudyJobData = async ({
    org,
    researcherId,
    studyStatus = 'APPROVED',
    jobStatus = 'JOB-READY',
}: {
    org?: MinimalTestOrg
    researcherId?: string
    studyStatus?: StudyStatus
    jobStatus?: StudyJobStatus
} = {}) => {
    if (!org) {
        org = await insertTestOrg()
    }
    if (!researcherId) {
        const { user } = await insertTestUser({ org: org })
        researcherId = user.id
    }
    const study = await db
        .insertInto('study')
        .values({
            orgId: org.id,
            containerLocation: 'test-container',
            title: 'my 1st study',
            researcherId: researcherId,
            piName: 'test',
            status: studyStatus,
            dataSources: ['all'],
            outputMimeType: 'application/zip',
        })
        .returningAll()
        .executeTakeFirstOrThrow()

    // Create job
    const job = await db
        .insertInto('studyJob')
        .values({
            studyId: study.id,
            language: 'R',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    const studyJobStatus = await db
        .insertInto('jobStatusChange')
        .values({
            status: jobStatus,
            studyJobId: job.id,
            userId: researcherId,
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    const latestJobWithStatus = await latestJobForStudy(study.id)

    return {
        job,
        org,
        study,
        studyJobStatus,
        latestJobWithStatus,
    }
}

export const insertTestStudyJobUsers = async ({ org }: { org?: MinimalTestOrg } = {}) => {
    if (!org) {
        org = await insertTestOrg()
    }
    const { user: user1 } = await insertTestUser({ org, isReviewer: true })
    const { user: user2 } = await insertTestUser({ org, isReviewer: false })

    const { study, job, ...rest } = await insertTestStudyJobData({ org })

    return { study, job, user1, user2, ...rest }
}

export async function createTempDir() {
    const ostmpdir = os.tmpdir()
    const tmpdir = path.join(ostmpdir, 'unit-test-')
    return await fs.promises.mkdtemp(tmpdir)
}

export type InsertTestOrgOptions = {
    slug: string
    name?: string
    description?: string | null
    email?: string
    publicKey?: string
}

export const insertTestOrg = async (opts: InsertTestOrgOptions = { slug: faker.string.alpha(10) }) => {
    const privateKey = await readTestSupportFile('private_key.pem')
    const defaultPublicKey = await readTestSupportFile('public_key.pem')

    const existing = await db.selectFrom('org').where('slug', '=', opts.slug).selectAll('org').executeTakeFirst()
    const org =
        existing ||
        (await db
            .insertInto('org')
            .values({
                slug: opts.slug,
                name: opts.name || faker.company.name(),
                description: opts.description ?? null,
                email: opts.email || `${opts.slug}@example.com`,
                publicKey: opts.publicKey || defaultPublicKey,
            })
            .returningAll()
            .executeTakeFirstOrThrow())
    ;(await headers()).set(
        'Authorization',
        `Bearer ${jwt.sign(
            {
                iss: opts.slug,
            },
            privateKey,
            { algorithm: 'RS256' },
        )}`,
    )
    return org as Org
}

export const insertTestOrgStudyJobUsers = async () => {
    const org = await insertTestOrg()
    const result = await insertTestStudyJobUsers({ org })
    return { ...result, org }
}

type MockSession = {
    clerkUserId: string
    userId: string
    orgSlug: string
    imageUrl?: string
    orgId?: string
    roles?: Partial<UserOrgRoles>
}

export type ClerkMocks = ReturnType<typeof mockClerkSession>

export const mockClerkSession = (values: MockSession) => {
    const client = clerkClient as unknown as Mock
    const user = currentClerkUser as unknown as Mock
    const auth = clerkAuth as unknown as Mock
    const unsafeMetadata = {
        [`${ENVIRONMENT_ID}`]: {
            currentTeamSlug: values.orgSlug,
        },
    }
    const publicMetadata = {
        [`${ENVIRONMENT_ID}`]: {
            user: {
                id: values.userId,
            },
            teams: {
                [`${values.orgSlug}`]: {
                    id: values.orgId,
                    slug: values.orgSlug,
                    isAdmin: false,
                    isReviewer: true,
                    isResearcher: true,
                    ...(values.roles || {}),
                },
            },
        },
    }
    const userProperties = {
        id: values.clerkUserId,
        banned: false,
        twoFactorEnabled: true,
        imageUrl: values.imageUrl,
        organizationMemberships: [],
        unsafeMetadata,
        publicMetadata,
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
            getUser: vi.fn(async (clerkId: string) => ({
                id: clerkId,
                firstName: 'Mocked',
                lastName: 'User',
                emailAddresses: [{ emailAddress: faker.internet.email({ provider: 'test.com' }) }],
            })),
            createUser: vi.fn(async () => ({ id: '1234' })),
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

type MockSessionWithTestDataOptions = {
    orgSlug?: string
    isResearcher?: boolean
    isReviewer?: boolean
    isAdmin?: boolean
    clerkId?: string
}

export async function mockSessionWithTestData(options: MockSessionWithTestDataOptions = {}) {
    if (!options.orgSlug) options.orgSlug = options.isAdmin ? CLERK_ADMIN_ORG_SLUG : faker.string.alpha(10)

    const org = await insertTestOrg({ slug: options.orgSlug })
    const { user, orgUser } = await insertTestUser({ org: { id: org.id, slug: options.orgSlug }, ...options })

    const mocks = mockClerkSession({
        userId: user.id,
        clerkUserId: user.clerkId,
        orgSlug: org.slug,
        orgId: org.id,
        roles: {
            isResearcher: options.isResearcher ?? true,
            isReviewer: options.isReviewer ?? true,
            isAdmin: options.isAdmin ?? false,
        },
    })

    const session = { user, team: { id: org.id, slug: org.slug } }

    return { session, org, user, orgUser, ...mocks }
}
