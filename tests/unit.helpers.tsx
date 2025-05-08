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
import { latestJobForStudy } from '@/server/db/queries'
import type { StudyJobStatus, StudyStatus } from '@/database/types'
import { Org } from '@/schema/org'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'

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
            resultFormat: 'SI_V1_ENCRYPT',
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
            resultFormat: 'SI_V1_ENCRYPT',
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
            resultFormat: 'SI_V1_ENCRYPT',
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
            email: faker.internet.email(),
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
        .returning('id')
        .executeTakeFirstOrThrow()

    // Create job
    const job = await db
        .insertInto('studyJob')
        .values({
            studyId: study.id,
            resultsPath: jobStatus == 'RESULTS-APPROVED' ? 'test-results.csv' : null,
            resultFormat: jobStatus == 'RUN-COMPLETE' ? 'SI_V1_ENCRYPT' : null,
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

    const latestJobithStatus = await latestJobForStudy(study.id, { orgSlug: org.slug, userId: researcherId })

    return {
        study,
        job,
        studyJobStatus,
        latestJobithStatus,
    }
}

export const insertTestStudyJobUsers = async ({ org }: { org?: MinimalTestOrg } = {}) => {
    if (!org) {
        org = await insertTestOrg()
    }
    const { user: user1 } = await insertTestUser({ org })
    const { user: user2 } = await insertTestUser({ org, isReviewer: false })

    const { study, job } = await insertTestStudyJobData({ org })

    return { study, job, user1, user2 }
}

export async function createTempDir() {
    const ostmpdir = os.tmpdir()
    const tmpdir = path.join(ostmpdir, 'unit-test-')
    return await fs.promises.mkdtemp(tmpdir)
}

export const insertTestOrg = async (opts: { slug: string } = { slug: faker.string.alpha(10) }) => {
    const privateKey = await readTestSupportFile('private_key.pem')
    const publicKey = await readTestSupportFile('public_key.pem')

    const existing = await db.selectFrom('org').where('slug', '=', opts.slug).selectAll().executeTakeFirst()
    const org =
        existing ||
        (await db
            .insertInto('org')
            .values({
                slug: opts.slug,
                name: 'test',
                email: 'none@test.com',
                publicKey,
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

type MockSession = {
    clerkUserId: string
    org_slug: string
    imageUrl?: string
    org_id?: string
}
export type ClerkMocks = ReturnType<typeof mockClerkSession>

export const mockClerkSession = (values: MockSession) => {
    const client = clerkClient as unknown as Mock
    const user = currentClerkUser as unknown as Mock
    const auth = clerkAuth as unknown as Mock
    const userProperties = {
        id: values.clerkUserId,
        banned: false,
        twoFactorEnabled: true,
        imageUrl: values.imageUrl,
    }
    user.mockResolvedValue(userProperties)
    const clientMocks = {
        organizations: {
            getOrganization: vi.fn(async (orgSlug: string) => ({
                slug: orgSlug,
                id: values.org_id || faker.string.alpha(10),
            })),
            createOrganization: vi.fn(async (org: object) => org),
            createOrganizationMembership: vi.fn(async () => ({ id: '1234' })),
        },
        users: {
            createUser: vi.fn(async () => ({ id: '1234' })),
        },
    }
    const useUserReturn = {
        isSignedIn: true,
        isLoaded: true,
        user: userProperties,
    }
    ;(useParams as Mock).mockReturnValue({
        orgSlug: values.org_slug,
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
        orgSlug: values.org_slug,
        sessionClaims: { org_slug: values.org_slug },
        userId: values.clerkUserId,
    }))

    return { client: clientMocks, auth, useUserReturn }
}

type MockSessionWithTestDataOptions = {
    orgSlug?: string
    isResearcher?: boolean
    isReviewer?: boolean
    isAdmin?: boolean
}


export async function mockSessionWithTestData(options: MockSessionWithTestDataOptions = {}) {
    if (!options.orgSlug) options.orgSlug = options.isAdmin ? CLERK_ADMIN_ORG_SLUG : faker.string.alpha(10)

    const org = await insertTestOrg({ slug: options.orgSlug })
    const { user, orgUser } = await insertTestUser({ org: { id: org.id, slug: options.orgSlug }, ...options })

    const mocks = mockClerkSession({
        clerkUserId: user.clerkId,
        org_slug: org.slug,
        org_id: org.id,
    })
    return { org, user, orgUser, ...mocks }
}
