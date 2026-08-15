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

    test('reserves the header only where it occupies the viewport', async ({ page }) => {
        await goto(page, '/openstax/dashboard')

        // Desktop collapses the header, so nothing should be reserved for it.
        const desktop = await page.evaluate(() => ({
            headerHeight: Math.round(
                document.querySelector('[class*="AppShell-header"]')?.getBoundingClientRect().height ?? 0,
            ),
            scrollPaddingTop: getComputedStyle(document.documentElement).scrollPaddingTop,
        }))
        expect(desktop.headerHeight).toBe(0)
        expect(desktop.scrollPaddingTop).toBe('0px')

        await page.setViewportSize({ width: 390, height: 844 })

        await expect
            .poll(async () =>
                page.evaluate(() => ({
                    headerHeight: Math.round(
                        document.querySelector('[class*="AppShell-header"]')?.getBoundingClientRect().height ?? 0,
                    ),
                    scrollPaddingTop: getComputedStyle(document.documentElement).scrollPaddingTop,
                })),
            )
            .toEqual({ headerHeight: 60, scrollPaddingTop: '60px' })
    })
})
