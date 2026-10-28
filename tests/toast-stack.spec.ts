import { Routes } from '@/lib/routes/definitions'
import { authFileFor, expect, goto, test } from './e2e.helpers'

// OTTER-840. The stack order and gap come from a globals.css rule on a div Mantine adds, and jsdom
// does not lay anything out, so only a browser measuring the toasts catches the rule breaking.
test.describe('toast stack', () => {
    test.use({ storageState: authFileFor('researcher') })

    test('puts the newest toast on top with an 8px gap', async ({ page }) => {
        await goto(page, Routes.researcherProfile)

        const personalInfo = page
            .locator('.mantine-Paper-root')
            .filter({ has: page.getByRole('heading', { name: 'Personal information' }) })
        await personalInfo.getByRole('button', { name: 'Edit' }).click()

        // A trailing space makes the form dirty, and the action trims it, so the shared researcher
        // keeps the same name for every other spec running in parallel.
        const lastName = page.getByLabel('Last name')
        await lastName.fill(`${await lastName.inputValue()} `)

        await page.route(`**${Routes.researcherProfile}`, (route) =>
            route.request().method() === 'POST' ? route.abort() : route.fallback(),
        )
        await page.getByRole('button', { name: 'Save changes' }).click()
        const older = page.locator('[data-toast-kind="error"]')
        await expect(older).toBeVisible()

        await page.unroute(`**${Routes.researcherProfile}`)
        await page.getByRole('button', { name: 'Save changes' }).click()
        const newer = page.locator('[data-toast-kind="success"]')
        await expect(newer).toBeVisible()

        // Retried so a box read mid enter-transition cannot decide the test.
        await expect(async () => {
            const olderBox = await older.boundingBox()
            const newerBox = await newer.boundingBox()
            expect(olderBox!.y - (newerBox!.y + newerBox!.height)).toBeCloseTo(8, 0)
        }).toPass()
    })
})
