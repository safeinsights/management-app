import { type Page } from '@playwright/test'
import { BLANK_UUID, db } from '@/database'
import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright'
import fs from 'fs'
import path from 'path'
import os from 'os'

type VisitClerkProtectedPageOptions = { url: string; role: 'researcher'; page: Page }
export const visitClerkProtectedPage = async ({ page, url }: VisitClerkProtectedPageOptions) => {
    await setupClerkTestingToken({ page })
    await page.goto(url)
    console.log('LOGIN WITH', {
        url,
        id: process.env.E2E_CLERK_RESEARCHER_EMAIL!.slice(0, 6),
        pwda: process.env.E2E_CLERK_RESEARCHER_PASSWORD!.slice(0, 6),
    })
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

export const insertTestData = async () => {
    const study = await db
        .insertInto('study')
        .values({
            id: BLANK_UUID,
            containerLocation: 'test-container',
            memberId: BLANK_UUID,
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
        memberId: BLANK_UUID,
        studyId: study.id,
        runIds: [run1.id, run2.id],
    }
}

export async function createTempDir() {
    const ostmpdir = os.tmpdir()
    const tmpdir = path.join(ostmpdir, 'unit-test-')
    return await fs.promises.mkdtemp(tmpdir)
}
