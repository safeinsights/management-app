import { authFileFor, expect, goto, test } from './e2e.helpers'

// OTTER-647. globals.css reserves the bar heights via Mantine variables; a Mantine upgrade that
// renames or rescopes them leaves the rule present but inert, which only a browser can catch.
test.describe('scroll padding for the fixed app shell bars', () => {
    test.use({ storageState: authFileFor('reviewer') })

    test('keeps scrolled-to content clear of the fixed footer', async ({ page }) => {
        await goto(page, '/openstax/dashboard')

        const footerHeight = await page.evaluate(() => {
            const footer = document.querySelector('[class*="AppShell-footer"]')
            return footer ? Math.round(footer.getBoundingClientRect().height) : 0
        })
        expect(footerHeight).toBeGreaterThan(0)

        const scrollPaddingBottom = await page.evaluate(
            () => getComputedStyle(document.documentElement).scrollPaddingBottom,
        )
        expect(scrollPaddingBottom).toBe(`${footerHeight}px`)
    })

    test('reserves the space the fixed header covers, at any viewport', async ({ page }) => {
        await goto(page, '/openstax/dashboard')

        // A collapsed header keeps its height and is translated above the top edge, so coverage
        // is 0 rather than the header height.
        const headerCoverage = () =>
            page.evaluate(() => {
                const header = document.querySelector('[class*="AppShell-header"]')
                const bottom = header ? header.getBoundingClientRect().bottom : 0
                return {
                    covers: `${Math.max(0, Math.round(bottom))}px`,
                    scrollPaddingTop: getComputedStyle(document.documentElement).scrollPaddingTop,
                }
            })

        // Both values are re-read inside the retry: the header settles over several frames, so a
        // single read could compare a part-way header against an already-final reservation.
        const expectReservationToMatchHeader = async ({ mustCover = false } = {}) => {
            await expect(async () => {
                const { covers, scrollPaddingTop } = await headerCoverage()
                if (mustCover) expect(covers).not.toBe('0px')
                expect(scrollPaddingTop).toBe(covers)
            }).toPass()
        }

        await expectReservationToMatchHeader()

        await page.setViewportSize({ width: 390, height: 844 })

        await expectReservationToMatchHeader({ mustCover: true })
    })
})
