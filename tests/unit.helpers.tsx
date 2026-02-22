import { db } from '@/database'

import type { Json, Language, StudyJobStatus, StudyStatus } from '@/database/types'
import { CLERK_ADMIN_ORG_SLUG, UserOrgRoles } from '@/lib/types'
import { Org } from '@/schema/org'
import { latestJobForStudy } from '@/server/db/queries'
import { findOrCreateOrgMembership } from '@/server/mutations'
import { theme } from '@/theme'
import { useAuth, useClerk, useSession, useUser } from '@clerk/nextjs'
import { auth as clerkAuth, clerkClient, currentUser as currentClerkUser } from '@clerk/nextjs/server'
import { faker } from '@faker-js/faker'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import fs from 'fs'
import jwt from 'jsonwebtoken'
import { headers } from 'next/headers.js'
import { useParams } from 'next/navigation'
import os from 'os'
import path from 'path'

import { ReactElement } from 'react'
import { Mock, vi } from 'vitest'

declare global {
    var __mockOpenStaxEnabled: boolean | undefined
}

import userEvent from '@testing-library/user-event'
import * as RouterMock from 'next-router-mock'
export { userEvent }

// Helper to mock the current pathname inside unit tests that need to simulate specific routes.
// It leverages the underlying next-router-mock memory router so it plays nicely with
// the default router setup defined in `tests/vitest.setup.ts`.
export const mockPathname = (path: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(RouterMock as any).memoryRouter.setCurrentUrl(path)
}

// Helper to control OpenStax feature flag mock state.
export const mockOpenStaxFeatureFlagState = (enabled: boolean) => {
    globalThis.__mockOpenStaxEnabled = enabled
}

export { db } from '@/database'
export { faker } from '@faker-js/faker'
export { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
export { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

export const readTestSupportFile = (file: string) => {
    return fs.promises.readFile(path.join(__dirname, 'support', file), 'utf8')
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

export const insertTestStudyData = async ({
    org,
    researcherId,
    useRealKeys = false,
}: {
    org: MinimalTestOrg
    researcherId?: string
    useRealKeys?: boolean
}) => {
    if (!researcherId) {
        const { user } = await insertTestUser({ org, useRealKeys })
        researcherId = user.id
    }
    const study = await db
        .insertInto('study')
        .values({
            orgId: org.id,
            submittedByOrgId: org.id,
            containerLocation: 'test-container',
            title: 'my 1st study',
            researcherId: researcherId,
            piName: 'test',
            irbProtocols: 'https://www.google.com',
            status: 'APPROVED',
            dataSources: ['all'],
            outputMimeType: 'text/csv',
            language: 'R',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    const job0 = await db
        .insertInto('studyJob')
        .values({
            studyId: study.id,
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
        researcherId: researcherId,
    }
}

export const insertTestUser = async ({
    org,
    isAdmin = false,
    useRealKeys = false,
}: {
    org: MinimalTestOrg
    isAdmin?: boolean
    useRealKeys?: boolean
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
            isAdmin,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

    // Add user public key for enclave orgs (reviewers)
    if (org.type === 'enclave') {
        let publicKey: Buffer
        let fingerprint: string

        if (useRealKeys) {
            const { pemToArrayBuffer, fingerprintKeyData } = await import('si-encryption/util')
            const publicKeyPem = await readTestSupportFile('public_key.pem')
            const publicKeyArrayBuffer = pemToArrayBuffer(publicKeyPem)
            publicKey = Buffer.from(publicKeyArrayBuffer)
            fingerprint = await fingerprintKeyData(publicKeyArrayBuffer)
        } else {
            publicKey = Buffer.from('testPublicKey1')
            fingerprint = 'testFingerprint1'
        }

        await db
            .insertInto('userPublicKey')
            .values({
                userId: user.id,
                publicKey,
                fingerprint,
            })
            .executeTakeFirstOrThrow()
    }

    return { user, orgUser }
}

type MinimalTestOrg = { slug: string; id: string; type: 'enclave' | 'lab' }

export const insertTestStudyJobData = async ({
    org,
    researcherId,
    studyStatus = 'APPROVED',
    jobStatus = 'JOB-READY',
    language,
    title,
    piName,
    researchQuestions,
    projectSummary,
    impact,
    additionalNotes,
    datasets,
}: {
    org?: MinimalTestOrg
    researcherId?: string
    studyStatus?: StudyStatus
    jobStatus?: StudyJobStatus
    language?: Language
    title?: string
    piName?: string
    datasets?: string[] | null
    researchQuestions?: Json | null
    projectSummary?: Json | null
    impact?: Json | null
    additionalNotes?: Json | null
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
            submittedByOrgId: org.id,
            containerLocation: 'test-container',
            title: title ?? 'my 1st study',
            researcherId: researcherId,
            piName: piName ?? 'test',
            status: studyStatus,
            dataSources: ['all'],
            outputMimeType: 'application/zip',
            language: language || 'R',
            datasets: datasets ?? null,
            researchQuestions: researchQuestions ?? null,
            projectSummary: projectSummary ?? null,
            impact: impact ?? null,
            additionalNotes: additionalNotes ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

    // Create job
    const job = await db
        .insertInto('studyJob')
        .values({
            studyId: study.id,
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

export const insertTestStudyOnly = async ({ orgSlug }: { orgSlug: string }) => {
    const org = await insertTestOrg({ slug: orgSlug })
    const { user } = await insertTestUser({ org })
    const study = await db
        .insertInto('study')
        .values({
            orgId: org.id,
            submittedByOrgId: org.id,
            containerLocation: 'test-container',
            title: 'study without job',
            researcherId: user.id,
            piName: 'test',
            status: 'APPROVED',
            dataSources: ['all'],
            outputMimeType: 'application/zip',
            language: 'R',
        })
        .returningAll()
        .executeTakeFirstOrThrow()
    return { org, user, study }
}

export const insertTestStudyJobUsers = async ({
    org,
    useRealKeys = false,
}: { org?: MinimalTestOrg; useRealKeys?: boolean } = {}) => {
    if (!org) {
        org = await insertTestOrg()
    }
    const { user: user1 } = await insertTestUser({ org, useRealKeys })
    const { user: user2 } = await insertTestUser({ org, useRealKeys })

    const { study, job, ...rest } = await insertTestStudyJobData({ org, researcherId: user1.id })

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
    type?: 'enclave' | 'lab'
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
                type: opts.type || 'enclave',
                settings: opts.type === 'lab' ? {} : { publicKey: opts.publicKey || defaultPublicKey },
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
    email?: string
    imageUrl?: string
    orgId?: string
    roles?: Partial<UserOrgRoles>
    orgType?: 'enclave' | 'lab'
    isSiAdmin?: boolean
    twoFactorEnabled?: boolean
}

export type ClerkMocks = ReturnType<typeof mockClerkSession>

export const mockClerkSession = (values: MockSession | null) => {
    if (values === null) {
        ;(useSession as Mock).mockReturnValue({
            session: null,
            isLoaded: true,
            isSignedIn: false,
        })
        ;(useClerk as Mock).mockReturnValue({
            signOut: vi.fn(),
        } as unknown as ReturnType<typeof useClerk>)
        return
    }

    const client = clerkClient as unknown as Mock
    const user = currentClerkUser as unknown as Mock
    const auth = clerkAuth as unknown as Mock
    // Flattened structure - no environment nesting
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
            id: 'si-org-id-mock',
            slug: CLERK_ADMIN_ORG_SLUG,
            type: 'enclave',
            isAdmin: true,
        }
    }
    // Flattened structure - no environment nesting
    const publicMetadata = {
        format: 'v3',
        user: {
            id: values.userId,
        },
        teams: null,
        orgs,
    }
    const mockEmail = values.email || faker.internet.email({ provider: 'test.com' })
    const userProperties = {
        id: values.clerkUserId,
        banned: false,
        twoFactorEnabled: values.twoFactorEnabled ?? true,
        imageUrl: values.imageUrl,
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

type MockSessionWithTestDataOptions = {
    orgSlug?: string
    orgType?: 'enclave' | 'lab'
    isAdmin?: boolean
    isSiAdmin?: boolean
    clerkId?: string
    twoFactorEnabled?: boolean
    useRealKeys?: boolean
}

export async function mockSessionWithTestData(options: MockSessionWithTestDataOptions = {}) {
    if (!options.orgSlug) options.orgSlug = options.isSiAdmin ? CLERK_ADMIN_ORG_SLUG : faker.string.alpha(10)

    const org = await insertTestOrg({ slug: options.orgSlug, type: options.orgType })
    const { user, orgUser } = await insertTestUser({
        org: { id: org.id, slug: options.orgSlug, type: org.type },
        isAdmin: options.isAdmin,
        useRealKeys: options.useRealKeys,
    })

    if (options.isSiAdmin) {
        await insertTestOrg({ slug: CLERK_ADMIN_ORG_SLUG })
        await findOrCreateOrgMembership({ userId: user.id, slug: CLERK_ADMIN_ORG_SLUG, isAdmin: true })
    }

    const mocks = mockClerkSession({
        userId: user.id,
        clerkUserId: user.clerkId,
        email: user.email ?? undefined,
        orgSlug: org.slug,
        orgId: org.id,
        roles: {
            isAdmin: options.isAdmin ?? false,
        },
        orgType: options.orgType ?? 'enclave',
        isSiAdmin: options.isSiAdmin,
        twoFactorEnabled: options.twoFactorEnabled,
    })

    const session = { user, org: { id: org.id, slug: org.slug } }

    return { session, org, user, orgUser, ...mocks }
}

export type InsertTestBaseImageOptions = {
    orgId: string
    name?: string
    language?: Language
    cmdLine?: string
    url?: string
    isTesting?: boolean
    starterCodePath?: string
    environment?: Array<{ name: string; value: string }>
}

export const insertTestBaseImage = async (options: InsertTestBaseImageOptions) => {
    const language = options.language || faker.helpers.arrayElement(['R', 'PYTHON'] as const)
    const fileExtension = language === 'R' ? 'R' : 'py'

    return await db
        .insertInto('orgBaseImage')
        .values({
            orgId: options.orgId,
            name: options.name || `${language} ${faker.system.semver()} Base Image`,
            language,
            cmdLine: options.cmdLine || (language === 'R' ? 'Rscript %f' : 'python %f'),
            url: options.url || `http://example.com/${language.toLowerCase()}-base-${faker.string.alphanumeric(6)}`,
            isTesting: options.isTesting ?? false,
            starterCodePath: options.starterCodePath || `test/path/to/starter.${fileExtension}`,
            settings: { environment: options.environment ?? [] },
        })
        .returningAll()
        .executeTakeFirstOrThrow()
}

// Re-export actionResult for backwards compatibility in tests
export { actionResult } from '@/lib/utils'

export type InsertTestResearcherProfileOptions = {
    userId: string
    education?: {
        institution?: string
        degree?: string
        fieldOfStudy?: string
        isCurrentlyPursuing?: boolean
    }
    positions?: Array<{
        affiliation: string
        position: string
        profileUrl?: string
    }>
    researchDetails?: {
        interests?: string[]
        detailedPublicationsUrl?: string
        featuredPublicationsUrls?: string[]
    }
}

export const insertTestResearcherProfile = async (options: InsertTestResearcherProfileOptions) => {
    await db
        .insertInto('researcherProfile')
        .values({
            userId: options.userId,
            educationInstitution: options.education?.institution ?? null,
            educationDegree: options.education?.degree ?? null,
            educationFieldOfStudy: options.education?.fieldOfStudy ?? null,
            educationIsCurrentlyPursuing: options.education?.isCurrentlyPursuing ?? false,
            researchInterests: options.researchDetails?.interests ?? [],
            detailedPublicationsUrl: options.researchDetails?.detailedPublicationsUrl ?? null,
            featuredPublicationsUrls: options.researchDetails?.featuredPublicationsUrls ?? [],
        })
        .onConflict((oc) =>
            oc.column('userId').doUpdateSet({
                educationInstitution: options.education?.institution ?? null,
                educationDegree: options.education?.degree ?? null,
                educationFieldOfStudy: options.education?.fieldOfStudy ?? null,
                educationIsCurrentlyPursuing: options.education?.isCurrentlyPursuing ?? false,
                researchInterests: options.researchDetails?.interests ?? [],
                detailedPublicationsUrl: options.researchDetails?.detailedPublicationsUrl ?? null,
                featuredPublicationsUrls: options.researchDetails?.featuredPublicationsUrls ?? [],
            }),
        )
        .execute()

    const profile = await db
        .selectFrom('researcherProfile')
        .selectAll('researcherProfile')
        .where('userId', '=', options.userId)
        .executeTakeFirstOrThrow()

    await db.deleteFrom('researcherPosition').where('userId', '=', options.userId).execute()

    let positions: Array<{
        id: string
        affiliation: string
        position: string
        profileUrl: string | null
        sortOrder: number
    }> = []

    if (options.positions && options.positions.length > 0) {
        const rows = options.positions.map((p, idx) => ({
            userId: options.userId,
            affiliation: p.affiliation,
            position: p.position,
            profileUrl: p.profileUrl ?? null,
            sortOrder: idx,
        }))
        await db.insertInto('researcherPosition').values(rows).execute()

        positions = await db
            .selectFrom('researcherPosition')
            .select(['id', 'affiliation', 'position', 'profileUrl', 'sortOrder'])
            .where('userId', '=', options.userId)
            .orderBy('sortOrder', 'asc')
            .execute()
    }

    return { profile, positions }
}

export const getTestResearcherProfileData = async (userId: string) => {
    const user = await db
        .selectFrom('user')
        .select(['id', 'firstName', 'lastName', 'email'])
        .where('id', '=', userId)
        .executeTakeFirstOrThrow()

    await db
        .insertInto('researcherProfile')
        .values({ userId })
        .onConflict((oc) => oc.column('userId').doNothing())
        .execute()

    const profile = await db
        .selectFrom('researcherProfile')
        .select([
            'userId',
            'educationInstitution',
            'educationDegree',
            'educationFieldOfStudy',
            'educationIsCurrentlyPursuing',
            'researchInterests',
            'detailedPublicationsUrl',
            'featuredPublicationsUrls',
        ])
        .where('userId', '=', userId)
        .executeTakeFirstOrThrow()

    const positions = await db
        .selectFrom('researcherPosition')
        .select(['id', 'affiliation', 'position', 'profileUrl', 'sortOrder'])
        .where('userId', '=', userId)
        .orderBy('sortOrder', 'asc')
        .execute()

    return { user, profile, positions }
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
