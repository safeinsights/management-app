import { Routes } from '@/lib/routes/definitions'
import { authFileFor, expect, goto, test, type Page } from './e2e.helpers'
import { ENCLAVE_SLUG, seedCodeSubmitted, seedSupplementalCode, storeSeededMainCode } from './e2e.seed'

const LONG_NAMES = Array.from({ length: 6 }, (_, i) => `supplemental-analysis-step-${i + 1}.R`)

async function openCodeReview(page: Page, title: string, supplementalNames: string[]) {
    const { studyId, jobId } = await seedCodeSubmitted(title)
    await storeSeededMainCode(studyId, jobId)
    await seedSupplementalCode(studyId, jobId, supplementalNames)
    await goto(page, Routes.studyReview({ orgSlug: ENCLAVE_SLUG, studyId }))
    await expect(page.getByRole('tab', { name: 'analysis.r' })).toHaveAttribute('aria-selected', 'true')
}

const rowScrollLeft = (page: Page) => page.locator('.mantine-Scroller-container').evaluate((row) => row.scrollLeft)

// The scroll controls follow measured overflow, which happy-dom cannot lay out.
test.describe('code review file tabs', () => {
    test.use({ storageState: authFileFor('reviewer') })

    test('shows a scroll control only towards tabs out of view', async ({ page, studyFeatures }) => {
        await page.setViewportSize({ width: 1280, height: 900 })
        await openCodeReview(page, studyFeatures.uniqueTitle('code tabs overflow'), LONG_NAMES)
        const scrollLeft = page.getByRole('button', { name: 'Scroll files left' })
        const scrollRight = page.getByRole('button', { name: 'Scroll files right' })

        await expect(scrollRight).toBeVisible()
        await expect(scrollLeft).toBeHidden()

        await scrollRight.click()
        await expect(scrollLeft).toBeVisible()

        await page.getByRole('tab', { name: 'analysis.r' }).focus()
        await page.keyboard.press('End')
        await expect(page.getByRole('tab', { name: LONG_NAMES[5] })).toBeFocused()
        await expect(scrollRight).toBeHidden()
        await expect(scrollLeft).toBeVisible()

        await page.keyboard.press('Home')
        await expect(scrollLeft).toBeHidden()
        await expect(scrollRight).toBeVisible()
    })

    test('keeps the row where it is when a tab out of the first view is selected', async ({ page, studyFeatures }) => {
        await page.setViewportSize({ width: 1280, height: 900 })
        await openCodeReview(page, studyFeatures.uniqueTitle('code tabs selection'), LONG_NAMES)
        const lastTab = page.getByRole('tab', { name: LONG_NAMES[5] })

        await page.getByRole('tab', { name: 'analysis.r' }).focus()
        await page.keyboard.press('End')
        await expect(page.getByRole('button', { name: 'Scroll files right' })).toBeHidden()
        const scrolledTo = await rowScrollLeft(page)
        expect(scrolledTo).toBeGreaterThan(0)

        await lastTab.click()
        await expect(lastTab).toHaveAttribute('aria-selected', 'true')
        await expect(page.getByTestId('study-code-body')).toContainText(LONG_NAMES[5])
        expect(await rowScrollLeft(page)).toBe(scrolledTo)
    })

    test('shows the scroll controls once a narrower window makes the tabs overflow', async ({
        page,
        studyFeatures,
    }) => {
        await page.setViewportSize({ width: 1600, height: 900 })
        await openCodeReview(page, studyFeatures.uniqueTitle('code tabs resize'), ['helpers.R', 'plots.R'])
        const scrollRight = page.getByRole('button', { name: 'Scroll files right' })

        await expect(page.getByRole('tab', { name: 'plots.R' })).toBeVisible()
        await expect(scrollRight).toBeHidden()

        await page.setViewportSize({ width: 480, height: 900 })
        await expect(scrollRight).toBeVisible()
    })
})
