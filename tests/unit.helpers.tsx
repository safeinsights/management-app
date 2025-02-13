import { BLANK_UUID, db } from '@/database'
import fs from 'fs'
import path from 'path'
import os from 'os'
import jwt from 'jsonwebtoken'
import { headers } from 'next/headers.js'
import { readTestSupportFile } from './common.helpers'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { theme } from '@/theme'
import { ReactElement } from 'react'

const createTestQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    })

export function renderWithProviders(ui: ReactElement) {
    const testQueryClient = createTestQueryClient()

    return render(
        <QueryClientProvider client={testQueryClient}>
            <MantineProvider theme={theme}>
                <ModalsProvider>{ui}</ModalsProvider>
            </MantineProvider>
        </QueryClientProvider>,
    )
}

export * from './common.helpers'

export const insertTestStudyData = async (opts: { memberId: string }) => {
    const study = await db
        .insertInto('study')
        .values({
            memberId: opts.memberId,
            containerLocation: 'test-container',
            title: 'my 1st study',
            description: 'my description',
            researcherId: BLANK_UUID,
            piName: 'test',
            status: 'APPROVED',
            dataSources: ['all'],
            outputMimeType: 'text/csv',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    const run0 = await db
        .insertInto('studyRun')
        .values({
            studyId: study.id,
            status: 'INITIATED',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    const run1 = await db
        .insertInto('studyRun')
        .values({
            studyId: study.id,
            status: 'RUNNING',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    const run2 = await db
        .insertInto('studyRun')
        .values({
            studyId: study.id,
            status: 'READY',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    return {
        memberId: opts.memberId,
        studyId: study.id,
        runIds: [run0.id, run1.id, run2.id],
    }
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
