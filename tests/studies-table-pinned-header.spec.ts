import { Routes } from '@/lib/routes/definitions'
import { authFileFor, expect, goto, test, type Page } from './e2e.helpers'
import { ENCLAVE_SLUG, seedProposalPendingReview } from './e2e.seed'

// Pinning needs real layout, so only a browser can catch the header hiding behind the top nav.
const PINNED_GAP = 32

const readHeaderLayout = (page: Page) =>
    page.evaluate((gap) => {
        const navBottom = document.querySelector('nav[aria-label="Account"]')!.getBoundingClientRect().bottom
        const header = document.querySelector('table')!.tHead!
        const headerRect = header.getBoundingClientRect()
        const inGap = document.elementFromPoint(headerRect.left + 8, headerRect.top - gap / 2)
        return {
            gapBelowNav: Math.round(headerRect.top - navBottom),
            gapHitsHeader: !!inGap && header.contains(inGap),
            columnWidths: [...header.querySelectorAll('th')].map((th) => Math.round(th.getBoundingClientRect().width)),
        }
    }, PINNED_GAP)

// A negative `belowPinPoint` scrolls the table past where its header pins.
const scrollTableTo = (page: Page, belowPinPoint: number) =>
    page.evaluate(
        ({ gap, belowPinPoint }) => {
            const navBottom = document.querySelector('nav[aria-label="Account"]')!.getBoundingClientRect().bottom
            const tableTop = document.querySelector('table')!.getBoundingClientRect().top
            window.scrollBy(0, tableTop - (navBottom + gap + belowPinPoint))
        },
        { gap: PINNED_GAP, belowPinPoint },
    )

test.describe('studies table pinned header', () => {
    test.use({ storageState: authFileFor('reviewer'), viewport: { width: 1280, height: 400 } })

    test('pins the header an XL gap below the top nav, hides rows in the gap, and lets the account menu open over it', async ({
        page,
        studyFeatures,
    }) => {
        // A viewport of rows of its own: on a fresh database the page is otherwise too short to scroll
        // the table past its pin point, so the gap probe lands outside the table's clip.
        const titles = Array.from({ length: 8 }, (_, i) => studyFeatures.uniqueTitle(`pinned header ${i}`))
        for (const title of titles) await seedProposalPendingReview(title)
        await goto(page, Routes.orgDashboard({ orgSlug: ENCLAVE_SLUG }))
        // The loading skeleton is a table too, with equal columns; wait for the studies to replace it.
        await expect(page.getByRole('table').getByText(titles[0])).toBeVisible()

        // Unpinned, the band would sit over the content above the table.
        let restingWidths: number[] = []
        await expect(async () => {
            await scrollTableTo(page, 100)
            const resting = await readHeaderLayout(page)
            expect(resting.gapBelowNav).toBeGreaterThan(PINNED_GAP)
            expect(resting.gapHitsHeader).toBe(false)
            restingWidths = resting.columnWidths
        }).toPass()

        await expect(async () => {
            await scrollTableTo(page, -40)
            expect(await readHeaderLayout(page)).toEqual({
                gapBelowNav: PINNED_GAP,
                gapHitsHeader: true,
                columnWidths: restingWidths,
            })
        }).toPass()

        await page.getByRole('button', { name: 'profile menu' }).click()
        const menu = page.getByRole('dialog')
        await expect(menu).toBeVisible()
        await expect(async () => {
            const menuOnTop = await menu.evaluate((el) => {
                const rect = el.getBoundingClientRect()
                const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 8)
                return !!hit && el.contains(hit)
            })
            expect(menuOnTop).toBe(true)
        }).toPass()
    })
})
