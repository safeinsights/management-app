import { test as base, expect, type BrowserContext, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createQaClient, type QaClient } from '../api/qa-client'
import { resolveTarget, type Target } from './config'
import { accountFor, missingCredentials, type Account, type DeployedRole } from './env'
import { sessionToken } from './auth'

export { expect }
export type { Page }

const TESTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// Saved sessions, apart from the hermetic suite's (tests/.auth/local) and per target.
export const authFileFor = (target: Target, role: DeployedRole) =>
    path.join(TESTS_DIR, '.auth', 'deployed', target.name, `${role}.json`)

// Every study a run creates, so the teardown can delete what a crashed test could not.
export const RUN_MANIFEST = path.join(process.cwd(), 'test-results', 'deployed', 'run-manifest.json')

export function readManifest(): string[] {
    try {
        return JSON.parse(fs.readFileSync(RUN_MANIFEST, 'utf8')) as string[]
    } catch {
        return []
    }
}

function writeManifest(ids: string[]) {
    fs.mkdirSync(path.dirname(RUN_MANIFEST), { recursive: true })
    fs.writeFileSync(RUN_MANIFEST, JSON.stringify(ids))
}

// For a lifecycle spread over several serial tests: remembered in stage one, forgotten by the
// stage that deletes it, swept by global teardown if the run never gets there.
export function rememberStudy(studyId: string) {
    writeManifest([...new Set([...readManifest(), studyId])])
}

export function forgetStudy(studyId: string) {
    writeManifest(readManifest().filter((id) => id !== studyId))
}

export type StudyTracker = { track(studyId: string): void }

type DeployedFixtures = {
    target: Target
    // Skips the test with the missing variable names when the target's accounts are not configured.
    requireCredentials: void
    accounts: Record<DeployedRole, Account>
    roleContext(role: DeployedRole): Promise<{ context: BrowserContext; page: Page }>
    // The QA API as the admin: tokens are minted from a signed-in page per call.
    qaApi: QaClient
    studyTracker: StudyTracker
}

export const test = base.extend<DeployedFixtures>({
    // eslint-disable-next-line no-empty-pattern
    target: async ({}, provide) => {
        await provide(resolveTarget())
    },
    requireCredentials: async ({ target }, provide) => {
        const missing = missingCredentials(target.accountsEnv)
        test.skip(missing.length > 0, `needs credentials for ${target.name}: ${missing.join(', ')}`)
        await provide()
    },
    accounts: async ({ target, requireCredentials: _ }, provide) => {
        await provide({
            admin: accountFor('admin', target.accountsEnv),
            researcher: accountFor('researcher', target.accountsEnv),
            reviewer: accountFor('reviewer', target.accountsEnv),
        })
    },
    roleContext: async ({ browser, target, requireCredentials: _ }, provide) => {
        const opened: BrowserContext[] = []
        await provide(async (role) => {
            const context = await browser.newContext({ storageState: authFileFor(target, role) })
            opened.push(context)
            return { context, page: await context.newPage() }
        })
        for (const context of opened) await context.close()
    },
    qaApi: async ({ browser, request, target, requireCredentials: _ }, provide) => {
        const context = await browser.newContext({ storageState: authFileFor(target, 'admin') })
        const page = await context.newPage()
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
        await provide(createQaClient(request, () => sessionToken(page)))
        await context.close()
    },
    studyTracker: async ({ qaApi }, provide) => {
        const tracked: string[] = []
        await provide({
            track(studyId) {
                tracked.push(studyId)
                writeManifest([...new Set([...readManifest(), studyId])])
            },
        })
        for (const studyId of tracked) {
            const response = await qaApi.deleteStudy(studyId)
            expect([200, 404], `cleanup of study ${studyId}: ${await response.text()}`).toContain(response.status())
            writeManifest(readManifest().filter((id) => id !== studyId))
        }
    },
})
