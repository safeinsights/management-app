import { type Page } from '@playwright/test'
import { BLANK_UUID, db } from '@/database'
import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright'
import fs from 'fs'
import path from 'path'
import os from 'os'
import jwt from 'jsonwebtoken'
import { headers } from 'next/headers'

type VisitClerkProtectedPageOptions = { url: string; role: 'researcher'; page: Page }
export const visitClerkProtectedPage = async ({ page, url }: VisitClerkProtectedPageOptions) => {
    await setupClerkTestingToken({ page })
    await page.goto(url)

    await clerk.signIn({
        page,
        signInParams: {
            strategy: 'password',
            identifier: process.env.E2E_CLERK_RESEARCHER_EMAIL!,
            password: process.env.E2E_CLERK_RESEARCHER_PASSWORD!,
        },
    })
}

export const readTestSupportFile = (file: string) => {
    return fs.promises.readFile(path.join(__dirname, 'support', file), 'utf8')
}

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
            status: 'approved',
            dataSources: ['all'],
            outputMimeType: 'text/csv',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    const run1 = await db
        .insertInto('studyRun')
        .values({
            studyId: study.id,
            status: 'pending',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    const run2 = await db
        .insertInto('studyRun')
        .values({
            studyId: study.id,
            status: 'pending',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    return {
        memberId: opts.memberId,
        studyId: study.id,
        runIds: [run1.id, run2.id],
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

    headers().set(
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
