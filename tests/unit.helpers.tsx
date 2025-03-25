import { db } from '@/database'
import fs from 'fs'
import path from 'path'
import os from 'os'
import jwt from 'jsonwebtoken'
import { headers } from 'next/headers.js'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { theme } from '@/theme'
import { ReactElement } from 'react'
import { auth as clerkAuth, currentUser as currentClerkUser } from '@clerk/nextjs/server'
import { Mock } from 'vitest'

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

export const insertTestStudyData = async (opts: { memberId: string }) => {
    const researcher = await db
        .selectFrom('user')
        .select('id')
        .where('isResearcher', '=', true)
        .executeTakeFirstOrThrow()

    const study = await db
        .insertInto('study')
        .values({
            memberId: opts.memberId,
            containerLocation: 'test-container',
            title: 'my 1st study',
            researcherId: researcher.id,
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
        .values({ status: 'INITIATED', studyJobId: job0.id, userId: researcher.id })
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
        .values({ status: 'JOB-RUNNING', studyJobId: job1.id, userId: researcher.id })
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
        .values({ status: 'JOB-READY', studyJobId: job2.id, userId: researcher.id })
        .execute()

    return {
        memberId: opts.memberId,
        studyId: study.id,
        jobIds: [job0.id, job1.id, job2.id],
    }
}

export const insertTestJobKeyData = async (opts: { memberId: string }) => {
    // Set users
    const user1 = await db
        .insertInto('user')
        .values({
            isResearcher: false,
            clerkId: 'testClerkId1',
            firstName: 'User One',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    const user2 = await db
        .insertInto('user')
        .values({
            isResearcher: false,
            clerkId: 'testClerkId2',
            firstName: 'User Two',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    // Add users as memberUsers
    await db
        .insertInto('memberUser')
        .values({
            memberId: opts.memberId,
            userId: user1.id,
            isAdmin: false,
            isReviewer: true,
        })
        .execute()

    await db
        .insertInto('memberUser')
        .values({
            memberId: opts.memberId,
            userId: user2.id,
            isAdmin: false,
            isReviewer: true,
        })
        .execute()

    // Give memberUsers a public key
    await db
        .insertInto('userPublicKey')
        .values({
            userId: user1.id,
            publicKey: Buffer.from('testPublicKey1'),
            fingerprint: 'testFingerprint1',
        })
        .execute()

    await db
        .insertInto('userPublicKey')
        .values({
            userId: user2.id,
            publicKey: Buffer.from('testPublicKey2'),
            fingerprint: 'testFingerprint2',
        })
        .execute()

    // Create a study for the member
    const researcher = await db
        .selectFrom('user')
        .select('id')
        .where('isResearcher', '=', true)
        .executeTakeFirstOrThrow()

    const study = await db
        .insertInto('study')
        .values({
            memberId: opts.memberId,
            containerLocation: 'test-container',
            title: 'my 1st study',
            researcherId: researcher.id,
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

    return job.id
}

export async function createTempDir() {
    const ostmpdir = os.tmpdir()
    const tmpdir = path.join(ostmpdir, 'unit-test-')
    return await fs.promises.mkdtemp(tmpdir)
}

export const mockApiMember = async (opts: { identifier: string } = { identifier: 'testy-mctest-face' }) => {
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
export const mockClerkSession = (values: MockSession) => {
    ;(currentClerkUser as unknown as Mock).mockResolvedValue({
        id: values.clerkUserId,
        banned: false,
    })
    ;(clerkAuth as unknown as Mock).mockImplementation(() => ({
        sessionClaims: { org_slug: values.org_slug },
    }))
}
