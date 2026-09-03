import type { Page } from '@playwright/test'
import { authFileFor, expect, goto, test } from './e2e.helpers'

// An org page takes its eyebrow from the organization; My dashboard is one of the three pages that
// has none and therefore renders the reserved empty slot.
const WITH_EYEBROW = '/openstax/dashboard'
const WITHOUT_EYEBROW = '/dashboard'

// OTTER-619. The empty eyebrow slot reserves one line box so the H1 sits at the same height on
// every page. A collapsed slot and a reserved one are identical in the DOM, so only a browser
// measuring layout catches the regression.
test.describe('page header eyebrow', () => {
    test.use({ storageState: authFileFor('reviewer') })

    // The reserved height follows the loaded webfont, so measuring before it settles reads the
    // fallback face instead.
    const eyebrowHeight = async (page: Page) => {
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await page.evaluate(() => document.fonts.ready.then(() => true))
        const box = await page.getByTestId('page-header-eyebrow').boundingBox()
        return box?.height
    }

    test('reserves the same height on a page that has no eyebrow', async ({ page }) => {
        await goto(page, WITH_EYEBROW)
        const filled = await eyebrowHeight(page)

        await goto(page, WITHOUT_EYEBROW)
        const empty = await eyebrowHeight(page)

        expect(filled).toBeGreaterThan(0)
        expect(empty).toBe(filled)
    })

    test('hands the eyebrow to assistive technology in its original casing', async ({ page }) => {
        await goto(page, WITH_EYEBROW)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

        // The capitals are presentational, so the accessibility tree must still carry a lowercase
        // letter. Matched by shape, because the seed derives the org name from its slug.
        await expect(page.getByTestId('page-header-eyebrow')).toMatchAriaSnapshot(`- paragraph: /[a-z]/`)
    })
})
