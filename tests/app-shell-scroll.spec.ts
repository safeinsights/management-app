import { authFileFor, expect, goto, test } from './e2e.helpers'

// OTTER-647: the AppShell footer is fixed over the bottom of the viewport, and the header does the
// same at the top on mobile. Scrolling an element into view stops as soon as its edge reaches the
// viewport edge, which parks it behind those bars: keyboard focus lands somewhere invisible (WCAG
// 2.4.11), and a click dispatched at the element's own coordinates presses the bar instead. On the
// review page that press lands outside the feedback editor and its required-field guard reports a
// field the reviewer never left.
//
// globals.css reserves both bars via Mantine's own variables. This asserts the reservation actually
// resolves in a browser, which is what a Mantine upgrade renaming or rescoping those variables would
// silently break; the rule itself would still be present and still do nothing.
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

        // How far down the header reaches, which is 0 when the shell collapses it out of the
        // viewport: it keeps its height and is translated above the top edge. Asserting against
        // that rather than against a fixed number keeps this true whatever the breakpoint does.
        const headerCoverage = () =>
            page.evaluate(() => {
                const header = document.querySelector('[class*="AppShell-header"]')
                const bottom = header ? header.getBoundingClientRect().bottom : 0
                return {
                    covers: `${Math.max(0, Math.round(bottom))}px`,
                    scrollPaddingTop: getComputedStyle(document.documentElement).scrollPaddingTop,
                }
            })

        const wide = await headerCoverage()
        expect(wide.scrollPaddingTop).toBe(wide.covers)

        await page.setViewportSize({ width: 390, height: 844 })

        // The header is fixed at this width, so the reservation has to be non-zero here. Polled
        // because the shell re-reads the breakpoint after the resize.
        await expect.poll(async () => await headerCoverage()).not.toEqual({ covers: '0px', scrollPaddingTop: '0px' })

        const narrow = await headerCoverage()
        expect(narrow.scrollPaddingTop).toBe(narrow.covers)
    })
})
