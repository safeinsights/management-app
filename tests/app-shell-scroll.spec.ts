import { authFileFor, expect, goto, test } from './e2e.helpers'

// OTTER-647. globals.css reserves the fixed header's height via Mantine variables; a Mantine upgrade
// that renames or rescopes them leaves the rule present but inert, which only a browser can catch.
// The in-app footer sits in the page flow (OTTER-692), so it needs no reservation.
test.describe('app shell bars and scrolled-to content', () => {
    test.use({ storageState: authFileFor('reviewer') })

    test('keeps the footer in the page flow, never over content', async ({ page }) => {
        await goto(page, '/openstax/dashboard')

        const footer = page.getByRole('contentinfo')
        await expect(footer).toHaveText(/SafeInsights \| Rice University/)

        // Re-read inside the retry: main and the footer settle over several frames after hydration.
        await expect(async () => {
            const layout = await footer.evaluate((footerEl) => ({
                position: getComputedStyle(footerEl).position,
                footerTop: Math.round(footerEl.getBoundingClientRect().top),
                mainBottom: Math.round(document.querySelector('main')!.getBoundingClientRect().bottom),
                scrollPaddingBottom: getComputedStyle(document.documentElement).scrollPaddingBottom,
            }))
            expect(layout.position).toBe('static')
            expect(layout.footerTop).toBeGreaterThanOrEqual(layout.mainBottom)
            expect(layout.scrollPaddingBottom).toBe('0px')
        }).toPass()
    })

    test('ends a short page with the footer at the viewport bottom, with nothing to scroll', async ({ page }) => {
        // Taller than the security key page, so main alone cannot fill the viewport.
        await page.setViewportSize({ width: 1280, height: 2000 })
        await goto(page, '/user-key')

        const footer = page.getByRole('contentinfo')
        await expect(footer).toHaveText(/SafeInsights \| Rice University/)

        await expect(async () => {
            const layout = await footer.evaluate((footerEl) => ({
                footerBottom: Math.round(footerEl.getBoundingClientRect().bottom),
                viewportHeight: window.innerHeight,
                scrollHeight: document.documentElement.scrollHeight,
            }))
            expect(layout.footerBottom).toBe(layout.viewportHeight)
            expect(layout.scrollHeight).toBe(layout.viewportHeight)
        }).toPass()
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
