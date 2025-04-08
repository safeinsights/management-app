import { db } from '@/database'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { faker } from '@faker-js/faker'
import jwt from 'jsonwebtoken'
import { headers } from 'next/headers.js'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { theme } from '@/theme'
import { ReactElement } from 'react'
import { useClerk, useAuth, useUser } from '@clerk/nextjs'
import { auth as clerkAuth, clerkClient, currentUser as currentClerkUser } from '@clerk/nextjs/server'
import { Mock, vi } from 'vitest'

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

export const insertTestStudyData = async ({ memberId, researcherId }: { memberId: string; researcherId?: string }) => {
    if (!researcherId) {
        const user = await insertTestUser({ memberId })
        researcherId = user.id
    }
    const study = await db
        .insertInto('study')
        .values({
            memberId: memberId,
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
        memberId: memberId,
        studyId: study.id,
        jobIds: [job0.id, job1.id, job2.id],
    }
}

export const insertTestUser = async ({
    memberId,
    isResearcher = true,
    isReviewer = true,
}: {
    memberId: string
    isResearcher?: boolean
    isReviewer?: boolean
}) => {
    const user = await db
        .insertInto('user')
        .values({
            isResearcher,
            clerkId: faker.string.alpha(10),
            firstName: faker.person.firstName(),
            lastName: faker.person.lastName(),
            email: faker.internet.email(),
        })
        .returningAll()
        .executeTakeFirstOrThrow()

    // Add users as memberUsers
    await db
        .insertInto('memberUser')
        .values({
            memberId,
            userId: user.id,
            isAdmin: false,
            isReviewer,
        })
        .execute()

    if (isReviewer) {
        await db
            .insertInto('userPublicKey')
            .values({
                userId: user.id,
                publicKey: Buffer.from('testPublicKey1'),
                fingerprint: 'testFingerprint1',
            })
            .execute()
    }

    return user
}

export const insertTestJobKeyData = async ({ memberId }: { memberId: string }) => {
    const user1 = await insertTestUser({ memberId })
    const user2 = await insertTestUser({ memberId, isReviewer: false })

    const study = await db
        .insertInto('study')
        .values({
            memberId: memberId,
            containerLocation: 'test-container',
            title: 'my 1st study',
            researcherId: user1.id,
            piName: 'test',
            status: 'PENDING-REVIEW',
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
            resultFormat: 'SI_V1_ENCRYPT',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    return { study, job, user1, user2 }
}

export async function createTempDir() {
    const ostmpdir = os.tmpdir()
    const tmpdir = path.join(ostmpdir, 'unit-test-')
    return await fs.promises.mkdtemp(tmpdir)
}

export const insertTestMember = async (opts: { identifier: string } = { identifier: faker.string.alpha(10) }) => {
    const privateKey = await readTestSupportFile('private_key.pem')
    const publicKey = await readTestSupportFile('public_key.pem')

    const member = await db
        .insertInto('member')
        .values({
            identifier: opts.identifier,
            name: 'test',
            email: 'none@test.com',
            publicKey,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

    ;(await headers()).set(
        'Authorization',
        `Bearer ${jwt.sign(
            {
                iss: opts.identifier,
            },
            privateKey,
            { algorithm: 'RS256' },
        )}`,
    )
    return member
}

type MockSession = {
    //userId: string
    clerkUserId: string
    org_slug: string
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
    }
    user.mockResolvedValue(userProperties)
    const clientMocks = {
        organizations: {
            getOrganization: vi.fn(async (orgSlug: string) => ({
                slug: orgSlug,
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
    ;(useUser as Mock).mockReturnValue(useUserReturn)
    client.mockResolvedValue(clientMocks)
    ;(useClerk as Mock).mockReturnValue({
        isLoaded: true,
    })
    ;(useAuth as Mock).mockReturnValue({
        isLoaded: true,
    })
    auth.mockImplementation(() => ({
        sessionClaims: { org_slug: values.org_slug },
        userId: values.clerkUserId,
    }))

    return { client: clientMocks, auth, useUserReturn }
}

export async function mockSessionWithTestData(memberIdentifier = faker.string.alpha(10)) {
    const member = await insertTestMember({ identifier: memberIdentifier })
    const user = await insertTestUser({ memberId: member.id })

    const mocks = mockClerkSession({
        clerkUserId: user.clerkId,
        org_slug: member.identifier,
    })
    return { member, user, ...mocks }
}
