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
import { Member } from '@/schema/member'

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
    member,
    researcherId,
}: {
    member: MinimalTestMember
    researcherId?: string
}) => {
    if (!researcherId) {
        const user = await insertTestUser({ member })
        researcherId = user.id
    }
    const study = await db
        .insertInto('study')
        .values({
            memberId: member.id,
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
        memberId: member.id,
        studyId: study.id,
        jobs: [job0, job1, job2],
        jobIds: [job0.id, job1.id, job2.id],
    }
}

export const insertTestUser = async ({
    member,
    isResearcher = true,
    isReviewer = true,
}: {
    member: MinimalTestMember
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
            memberId: member.id,
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

type MinimalTestMember = { slug: string; id: string }

export const insertTestStudyJobData = async ({
    member,
    researcherId,
    studyStatus = 'APPROVED',
    jobStatus = 'JOB-READY',
}: {
    member?: MinimalTestMember
    researcherId?: string
    studyStatus?: StudyStatus
    jobStatus?: StudyJobStatus
} = {}) => {
    if (!member) {
        member = await insertTestMember()
    }
    if (!researcherId) {
        researcherId = (await insertTestUser({ member: member })).id
    }
    const study = await db
        .insertInto('study')
        .values({
            memberId: member.id,
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

    const latestJobithStatus = await latestJobForStudy(study.id, { orgSlug: member.slug, userId: researcherId })

    return {
        study,
        job,
        studyJobStatus,
        latestJobithStatus,
    }
}

export const insertTestStudyJobUsers = async ({ member }: { member?: MinimalTestMember } = {}) => {
    if (!member) {
        member = await insertTestMember()
    }
    const user1 = await insertTestUser({ member })
    const user2 = await insertTestUser({ member, isReviewer: false })

    const { study, job } = await insertTestStudyJobData({ member })

    return { study, job, user1, user2 }
}

export async function createTempDir() {
    const ostmpdir = os.tmpdir()
    const tmpdir = path.join(ostmpdir, 'unit-test-')
    return await fs.promises.mkdtemp(tmpdir)
}

export const insertTestMember = async (opts: { slug: string } = { slug: faker.string.alpha(10) }) => {
    const privateKey = await readTestSupportFile('private_key.pem')
    const publicKey = await readTestSupportFile('public_key.pem')

    const member = await db
        .insertInto('member')
        .values({
            slug: opts.slug,
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
                iss: opts.slug,
            },
            privateKey,
            { algorithm: 'RS256' },
        )}`,
    )
    return member as Member
}

type MockSession = {
    //userId: string
    clerkUserId: string
    org_slug: string
    profileImageUrl?: string
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
        profileImageUrl: values.profileImageUrl
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
    ;(useParams as Mock).mockReturnValue({
        memberSlug: values.org_slug,
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
        sessionClaims: { org_slug: values.org_slug },
        userId: values.clerkUserId,
    }))

    return { client: clientMocks, auth, useUserReturn }
}

export async function mockSessionWithTestData(memberSlug = faker.string.alpha(10)) {
    const member = await insertTestMember({ slug: memberSlug })
    const user = await insertTestUser({ member: { id: member.id, slug: memberSlug } })

    const mocks = mockClerkSession({
        clerkUserId: user.clerkId,
        org_slug: member.slug,
    })
    return { member, user, ...mocks }
}
