import { db } from '@/database'

import type { AuditRecordType, Json, Language, StudyJobStatus, StudyStatus } from '@/database/types'
import { CLERK_ADMIN_ORG_SLUG, UserOrgRoles } from '@/lib/types'
import { Org } from '@/schema/org'
import { latestJobForStudy } from '@/server/db/queries'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { findOrCreateOrgMembership } from '@/server/mutations'
import { onSaveDraftStudyAction } from '@/server/actions/study-request'
import { actionResult } from '@/lib/utils'
import { theme } from '@/theme'
import { useAuth, useClerk, useSession, useUser } from '@clerk/nextjs'
import { auth as clerkAuth, clerkClient, currentUser as currentClerkUser } from '@clerk/nextjs/server'
import { faker } from '@faker-js/faker'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { SpyModeProvider } from '@/components/spy-mode-context'
import { YjsWebsocketProvider } from '@/lib/realtime/yjs-websocket-context'
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import fs from 'fs'
import jwt from 'jsonwebtoken'
import { headers } from 'next/headers.js'
import { useParams } from 'next/navigation'
import os from 'os'
import path from 'path'
import type { StudyRow } from '@/components/dashboard/studies-table/types'
import type { ScreenComponentProps } from '@/app/[orgSlug]/study/[studyId]/_screens/types'

import { ReactElement, ReactNode } from 'react'
import { expect, Mock, vi } from 'vitest'

import userEvent from '@testing-library/user-event'
import * as RouterMock from 'next-router-mock'
export { userEvent }

export const mockPathname = (path: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(RouterMock as any).memoryRouter.setCurrentUrl(path)
}

export { db } from '@/database'
export { faker } from '@faker-js/faker'
export { QueryClientProvider }
export { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
export { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

export const getAuditEntries = (recordId: string, recordType: AuditRecordType) =>
    db
        .selectFrom('audit')
        .select(['eventType', 'recordType', 'recordId', 'userId'])
        .where('recordId', '=', recordId)
        .where('recordType', '=', recordType)
        .execute()

// Separate from getAuditEntries, whose callers use toContainEqual — exact-object matching
// would break on an extra metadata key.
export const getAuditEntriesWithMetadata = (recordId: string, recordType: AuditRecordType) =>
    db
        .selectFrom('audit')
        .select(['eventType', 'recordType', 'recordId', 'userId', 'metadata', 'createdAt'])
        .where('recordId', '=', recordId)
        .where('recordType', '=', recordType)
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .execute()

export const readTestSupportFile = (file: string) => {
    return fs.promises.readFile(path.join(__dirname, 'support', file), 'utf8')
}

// Tracked so resetTestQueryClients can tear them down: a still-live client's refetchInterval
// timer otherwise fires during the NEXT test, flipping component state.
const liveTestQueryClients = new Set<QueryClient>()

export const createTestQueryClient = () => {
    const client = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                refetchOnMount: false,
                refetchOnWindowFocus: false,
                refetchOnReconnect: false,
            },
            mutations: {
                retry: false,
            },
        },
    })
    liveTestQueryClients.add(client)
    return client
}

// Must run after RTL cleanup(), which removes the observers; this clears the data behind them.
export const resetTestQueryClients = () => {
    for (const client of liveTestQueryClients) {
        client.clear()
    }
    liveTestQueryClients.clear()
}

// For `renderHook(..., { wrapper: createTestQueryWrapper() })`.
export const createTestQueryWrapper = () => {
    const client = createTestQueryClient()
    const Wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    Wrapper.displayName = 'QueryClientWrapper'
    return Wrapper
}

/**
 * `singleUserEditing` swaps the collaborative editors for the standalone Lexical surface, putting
 * the editable node in the DOM instead of behind a skeleton awaiting a live websocket.
 */
export function renderWithProviders(
    ui: ReactElement,
    options?: Parameters<typeof render>[1] & { singleUserEditing?: boolean; queryClient?: QueryClient },
) {
    // A caller-supplied client lets a test prime a query before the first render.
    const testQueryClient = options?.queryClient ?? createTestQueryClient()

    return render(
        <QueryClientProvider client={testQueryClient}>
            <MantineProvider theme={theme}>
                <SpyModeProvider>
                    <YjsWebsocketProvider singleUserEditing={options?.singleUserEditing}>
                        <ModalsProvider>{ui}</ModalsProvider>
                    </YjsWebsocketProvider>
                </SpyModeProvider>
            </MantineProvider>
        </QueryClientProvider>,
        options,
    )
}

export * from './common.helpers'

export const BLANK_UUID = '00000000-0000-0000-0000-000000000000'

// faker.internet.email() draws from ~1.9M addresses, narrow enough that a full run repeats one
// and user_email_lower_unique rejects the insert. The counter and token make them unique.
let emailSequence = 0
const emailWorkerToken = faker.string.alphanumeric({ length: 6, casing: 'lower' })

export const testEmail = (provider = 'test.com') => {
    const [localPart] = faker.internet.email({ provider }).split('@')
    return `${localPart}-${emailWorkerToken}${++emailSequence}@${provider}`
}

// Screen components take the raw study state their rules routed on (see render-screen.tsx).
export type ScreenInputs = Pick<ScreenComponentProps, 'study' | 'raw'>

export const requireRawState = async (studyId: string) => {
    const raw = await rawStudyStateForStudy(studyId)
    if (!raw) throw new Error(`no raw study state for study ${studyId}`)
    return raw
}

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

// `jobInfo` is nested rather than spread alongside `org` because `storeS3File` tags the uploaded
// object with every property it is handed, so anything but the three string fields throws.
export const insertTestJobInfo = async ({ org }: { org?: MinimalTestOrg } = {}) => {
    const testOrg = org ?? (await insertTestOrg())
    const { studyId, jobIds } = await insertTestStudyData({ org: testOrg })

    return { jobInfo: { orgSlug: testOrg.slug, studyId, studyJobId: jobIds[0] }, org: testOrg }
}

// The bytes are arbitrary: the ingest routes and `storeJobFile` never read them.
export const testUploadFile = (name: string, type = 'application/zip') =>
    new File([new TextEncoder().encode('boom')], name, { type })

// The /api/qa routes run on production and act only on "qa"-prefixed emails (see assertQaEmail).
export const qaEmail = () => `qa-${faker.string.alpha(10).toLowerCase()}@test.com`

export const insertTestUser = async ({
    org,
    isAdmin = false,
    useRealKeys = false,
    email,
}: {
    org: MinimalTestOrg
    isAdmin?: boolean
    useRealKeys?: boolean
    email?: string
}) => {
    const user = await db
        .insertInto('user')
        .values({
            clerkId: faker.string.alpha(10),
            firstName: faker.person.firstName(),
            lastName: faker.person.lastName(),
            email: email ?? testEmail(),
        })
        .returningAll()
        .executeTakeFirstOrThrow()

    const orgUser = await db
        .insertInto('orgUser')
        .values({
            orgId: org.id,
            userId: user.id,
            isAdmin,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

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
            submittedAt: studyStatus === 'DRAFT' ? null : new Date(),
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

// A baseline job is the file-less INITIATED row minted when a workspace is opened, before any
// code is submitted.
export const insertTestBaselineJob = async (studyId: string, { createdAt }: { createdAt?: Date } = {}) => {
    const job = await db
        .insertInto('studyJob')
        .values(createdAt ? { studyId, createdAt } : { studyId })
        .returning(['id', 'createdAt'])
        .executeTakeFirstOrThrow()
    await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'INITIATED' }).executeTakeFirstOrThrow()
    return job
}

// Pass `submittedByOrg` to put the two sides of a study on DIFFERENT orgs (orgId is the Data
// Partner, submittedByOrgId the Research Lab); a swapped join passes silently on a single org.
export const insertTestStudyOnly = async ({
    org,
    submittedByOrg,
    researcherId,
    title = 'study without job',
    status = 'APPROVED',
}: {
    org?: MinimalTestOrg
    submittedByOrg?: MinimalTestOrg
    researcherId?: string
    title?: string
    status?: StudyStatus
} = {}) => {
    if (!org) {
        org = await insertTestOrg()
    }
    if (!researcherId) {
        const { user } = await insertTestUser({ org: submittedByOrg ?? org })
        researcherId = user.id
    }
    const study = await db
        .insertInto('study')
        .values({
            orgId: org.id,
            submittedByOrgId: (submittedByOrg ?? org).id,
            containerLocation: 'test-container',
            title,
            researcherId,
            piName: 'test',
            status,
            submittedAt: new Date(),
            dataSources: ['all'],
            outputMimeType: 'application/zip',
            language: 'R',
        })
        .returningAll()
        .executeTakeFirstOrThrow()
    return { org, study }
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

// Legal documents are global singletons, so version counts assert on database-wide state.
// Keep the delete order, or the foreign keys refuse and concurrent suites deadlock.
export const resetLegalDocuments = async () => {
    await db.deleteFrom('legalDocumentAcknowledgement').execute()
    await db.deleteFrom('legalDocumentVersion').execute()
    await db.deleteFrom('legalDocument').execute()
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
    const publicMetadata = {
        format: 'v3',
        user: {
            id: values.userId,
        },
        teams: null,
        orgs,
    }
    const mockEmail = values.email || testEmail()
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

// A signed-in user holding no key, with a live invite to a second org. Every sign-in screen has to
// accept the invite before the key detour redirects, or the membership is lost.
export async function insertKeylessInvitedUser() {
    const { user, org } = await mockSessionWithTestData({ orgType: 'lab' })
    await db.deleteFrom('userPublicKey').where('userId', '=', user.id).execute()

    const invitingOrg = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
    const invite = await db
        .insertInto('pendingUser')
        .values({ email: user.email!, orgId: invitingOrg.id, isAdmin: false })
        .returning('id')
        .executeTakeFirstOrThrow()

    return { user, org, invitingOrg, invite }
}

type MockDualRoleSessionOptions = {
    labSlug?: string
    enclaveSlug?: string
    twoFactorEnabled?: boolean
}

// A user who is a member of BOTH a lab and an enclave, so server actions resolve the dual-role
// session the real app would.
export async function mockDualRoleSessionWithTestData(options: MockDualRoleSessionOptions = {}) {
    const labOrg = await insertTestOrg({ slug: options.labSlug ?? faker.string.alpha(10), type: 'lab' })
    const enclaveOrg = await insertTestOrg({ slug: options.enclaveSlug ?? faker.string.alpha(10), type: 'enclave' })

    const { user } = await insertTestUser({ org: { id: labOrg.id, slug: labOrg.slug, type: 'lab' } })
    await findOrCreateOrgMembership({ userId: user.id, slug: enclaveOrg.slug, isAdmin: false })

    const mocks = mockClerkSession({
        userId: user.id,
        clerkUserId: user.clerkId,
        email: user.email ?? undefined,
        orgSlug: labOrg.slug,
        orgId: labOrg.id,
        orgType: 'lab',
        twoFactorEnabled: options.twoFactorEnabled,
        extraOrgs: [{ slug: enclaveOrg.slug, id: enclaveOrg.id, type: 'enclave' }],
    })

    return { user, labOrg, enclaveOrg, ...mocks }
}

type CreateTestProposalDraftOptions = {
    /** Unique enclave slug for this test. The lab counterpart is derived as `${enclaveSlug}-lab`. */
    enclaveSlug: string
    studyInfo?: {
        title?: string
        piName?: string
        language?: Language
    }
}

// OTTER-497. Preferred over `insertTestStudyOnly` for collaboration tests, which collapse both
// org ids to one and so do not match the production lab/enclave split.
export async function createTestProposalDraft({ enclaveSlug, studyInfo = {} }: CreateTestProposalDraftOptions) {
    const enclave = await insertTestOrg({ type: 'enclave', slug: enclaveSlug })
    const lab = await insertTestOrg({ slug: `${enclave.slug}-lab`, type: 'lab' })
    const session = await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

    const draft = actionResult(
        await onSaveDraftStudyAction({
            orgSlug: enclave.slug,
            studyInfo: { title: 'Test draft', piName: 'PI', language: 'R', ...studyInfo },
            submittingOrgSlug: lab.slug,
        }),
    )

    return { enclave, lab, studyId: draft.studyId, user: session.user }
}

export const setTestStudyStatus = (studyId: string, status: StudyStatus) =>
    db.updateTable('study').set({ status }).where('id', '=', studyId).execute()

// The default 60 tokens is ~400 characters, comfortably inside every 1800-character cap.
// Build the string directly when a test is about a boundary.
export const buildFeedback = (tokenCount = 60) => Array.from({ length: tokenCount }, (_, i) => `word${i + 1}`).join(' ')

export const createWorkspaceDir = async (prefix: string) => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), `${prefix}-`))
    process.env.CODER_FILES = root
    return root
}

export const writeWorkspaceFiles = async (
    root: string,
    studyId: string,
    files: Record<string, string | Uint8Array>,
) => {
    const { CODER_DISABLED } = await import('@/server/config')
    const workspaceDir = CODER_DISABLED ? root : path.join(root, studyId)
    await fs.promises.mkdir(workspaceDir, { recursive: true })
    await Promise.all(
        Object.entries(files).map(([fileName, content]) =>
            fs.promises.writeFile(path.join(workspaceDir, fileName), content),
        ),
    )
}

export const cleanupWorkspaceDirs = async (dirs: string[]) => {
    delete process.env.CODER_FILES
    await Promise.all(dirs.splice(0).map((root) => fs.promises.rm(root, { recursive: true, force: true })))
}

export type InsertTestCodeEnvOptions = {
    orgId: string
    name?: string
    identifier?: string
    language?: Language
    commandLines?: Record<string, string>
    url?: string
    isTesting?: boolean
    starterCodeFileNames?: string[]
    environment?: Array<{ name: string; value: string }>
}

export const insertTestCodeEnv = async (options: InsertTestCodeEnvOptions) => {
    const language = options.language || faker.helpers.arrayElement(['R', 'PYTHON'] as const)
    const fileExtension = language === 'R' ? 'R' : 'py'
    const defaultFileName = `starter.${fileExtension}`

    const commandLines = options.commandLines || (language === 'R' ? { r: 'Rscript %f' } : { py: 'python %f' })
    const starterCodeFileNames = options.starterCodeFileNames || [defaultFileName]

    return await db
        .insertInto('orgCodeEnv')
        .values({
            orgId: options.orgId,
            name: options.name || `${language} ${faker.system.semver()} Code Environment`,
            identifier: options.identifier || faker.string.alphanumeric(8).toLowerCase(),
            language,
            commandLines,
            url: options.url || `example.com/${language.toLowerCase()}-base:${faker.string.alphanumeric(6)}`,
            isTesting: options.isTesting ?? false,
            starterCodeFileNames: starterCodeFileNames,
            settings: { environment: options.environment ?? [] },
        })
        .returningAll()
        .executeTakeFirstOrThrow()
}

type TestDataSourceUrl = {
    url: string | null
    description: string | null
}

export type InsertTestDataSourceOptions = {
    orgId: string
    codeEnvIds?: string[]
    name?: string
    description?: string | null
    urls?: TestDataSourceUrl[]
}

export const insertTestDataSource = async (options: InsertTestDataSourceOptions) => {
    const dataSource = await db
        .insertInto('orgDataSource')
        .values({
            orgId: options.orgId,
            name: options.name || `Data Source ${faker.string.alphanumeric(6)}`,
            description: options.description ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

    const codeEnvIds = options.codeEnvIds
    if (codeEnvIds?.length) {
        await db
            .insertInto('orgDataSourceCodeEnv')
            .values(codeEnvIds.map((codeEnvId) => ({ dataSourceId: dataSource.id, codeEnvId })))
            .execute()
    }

    const urls = options.urls
    const createdUrls = []
    if (urls?.length) {
        const urlRows = urls.map((u) => ({
            ...u,
            orgDataSourceId: dataSource.id,
        }))

        const res = await db
            .insertInto('orgDataSourceUrl')
            .values(urlRows)
            .returning(['id', 'url', 'description'])
            .execute()
        createdUrls.push(...res)
    }

    return { ...dataSource, urls: createdUrls }
}

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

export const expectStudyJobRecords = async (
    studyId: string,
    expectedFiles: Array<{ name: string; fileType: string }>,
) => {
    const latestJob = await db
        .selectFrom('studyJob')
        .select(['id'])
        .where('studyId', '=', studyId)
        .orderBy('createdAt', 'desc')
        .executeTakeFirstOrThrow()

    const jobFiles = await db
        .selectFrom('studyJobFile')
        .select(['name', 'fileType'])
        .where('studyJobId', '=', latestJob.id)
        .orderBy('fileType', 'asc')
        .execute()
    expect(jobFiles).toEqual(expectedFiles)

    // The SET of statuses, not their order: CODE-SUBMITTED and CODE-SCANNED are written in the
    // same operation and can share a created_at to the millisecond.
    const statuses = await db
        .selectFrom('jobStatusChange')
        .select(['status'])
        .where('studyJobId', '=', latestJob.id)
        .execute()
    expect(statuses.map((row) => row.status).sort()).toEqual(['CODE-SCANNED', 'CODE-SUBMITTED', 'INITIATED'])
}

export const mockStudyRow = (overrides: Partial<StudyRow> = {}): StudyRow => ({
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Test Study',
    status: 'APPROVED',
    createdAt: new Date(),
    submittedAt: new Date(),
    lastUpdatedAt: new Date(),
    reviewerName: null,
    researcherId: 'researcher-1',
    reviewerId: null,
    createdBy: 'Researcher Name',
    jobStatusChanges: [],
    researcherAgreementsAckedAt: null,
    piUserId: null,
    datasets: null,
    researchQuestions: null,
    projectSummary: null,
    impact: null,
    additionalNotes: null,
    hasStep2CollabDoc: false,
    ...overrides,
})

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
