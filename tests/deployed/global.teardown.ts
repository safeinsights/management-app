import { chromium, request as playwrightRequest } from '@playwright/test'
import { createQaClient } from '../api/qa-client'
import { sessionToken } from './auth'
import { resolveTarget } from './config'
import { missingCredentials } from './env'
import { authFileFor, readManifest } from './fixtures'

// Deletes the studies a crashed test left in the run manifest. A 404 is a study already gone.
export default async function globalTeardown() {
    const leftovers = readManifest()
    if (!leftovers.length) return
    const target = resolveTarget()
    if (missingCredentials(target.accountsEnv).length) return

    const browser = await chromium.launch()
    const context = await browser.newContext({ storageState: authFileFor(target, 'admin') })
    const page = await context.newPage()
    const request = await playwrightRequest.newContext({ baseURL: target.baseURL })
    try {
        await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
        const qa = createQaClient(request, () => sessionToken(page))
        for (const studyId of leftovers) {
            const response = await qa.deleteStudy(studyId)
            if (![200, 404].includes(response.status())) {
                console.warn(
                    `deployed teardown: could not delete study ${studyId}: ${response.status()} ${await response.text()}`,
                )
            }
        }
    } finally {
        await request.dispose()
        await browser.close()
    }
}
