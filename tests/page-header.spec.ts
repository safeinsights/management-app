import type { Page } from '@playwright/test'
import { Routes } from '@/lib/routes/definitions'
import { authFileFor, expect, goto, test, withRole } from './e2e.helpers'
import { ENCLAVE_SLUG, LAB_SLUG, seedProposalPendingReview } from './e2e.seed'

// An org page takes its eyebrow from the organization; My studies is one of the three pages that
// has none and therefore renders the reserved empty slot.
const WITH_EYEBROW = Routes.orgDashboard({ orgSlug: ENCLAVE_SLUG })
const WITHOUT_EYEBROW = Routes.dashboard

// Scoped to the main landmark: while React streams a page, a hidden copy of its header can sit in a
// segment under <body> for a moment, and an unscoped lookup then finds two eyebrows.
const pageEyebrow = (page: Page) => page.getByRole('main').getByTestId('page-header-eyebrow')

const eyebrowHeight = async (page: Page, url: string) => {
    await goto(page, url)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const box = await pageEyebrow(page).boundingBox()
    return box?.height ?? 0
}

// OTTER-619. The empty eyebrow slot reserves one line box so the H1 sits at the same height on
// every page. A collapsed slot and a reserved one are identical in the DOM, so only a browser
// measuring layout catches the regression.
test.describe('page header eyebrow', () => {
    test.use({ storageState: authFileFor('reviewer') })

    test('reserves the same height on a page that has no eyebrow', async ({ page }) => {
        // Retrying the comparison reads both heights again, so neither can decide the test from a
        // layout that had not settled. A wait on document.fonts.ready promises no relayout.
        await expect(async () => {
            const filled = await eyebrowHeight(page, WITH_EYEBROW)
            const empty = await eyebrowHeight(page, WITHOUT_EYEBROW)

            expect(filled).toBeGreaterThan(0)
            // The property is that the slot is reserved, not that two fractional-pixel
            // measurements match exactly. A collapsed slot is 0 and still fails.
            expect(empty).toBeCloseTo(filled, 1)
        }).toPass()
    })

    test('hands the eyebrow to assistive technology in its original casing', async ({ page }) => {
        await goto(page, WITH_EYEBROW)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

        // The capitals are presentational, so the accessibility tree must still carry a lowercase
        // letter. Matched by shape, because the seed derives the org name from its slug.
        await expect(pageEyebrow(page)).toMatchAriaSnapshot(`- paragraph: /[a-z]/`)
    })
})

// Gaps rather than positions: the title and the Test study badge change the header's height.
const expectHeaderSpacing = async (page: Page, url: string) => {
    await goto(page, url)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await expect(async () => {
        const { aboveEyebrow, belowHeader } = await pageEyebrow(page).evaluate((eyebrow) => {
            const main = eyebrow.closest('main')
            const header = eyebrow.parentElement
            const firstSection = header?.nextElementSibling
            if (!main || !header || !firstSection) return { aboveEyebrow: NaN, belowHeader: NaN }

            const contentTop = main.getBoundingClientRect().top + parseFloat(getComputedStyle(main).paddingTop)
            return {
                aboveEyebrow: eyebrow.getBoundingClientRect().top - contentTop,
                belowHeader: firstSection.getBoundingClientRect().top - header.getBoundingClientRect().bottom,
            }
        })

        expect(aboveEyebrow).toBeCloseTo(40, 0)
        expect(belowHeader).toBeCloseTo(32, 0)
    }).toPass()
}

test.describe('page header spacing', () => {
    test.use({ storageState: authFileFor('reviewer') })

    test('sits 40px from the top and 32px above the first card on study pages', async ({
        page,
        browser,
        studyFeatures,
    }) => {
        const { studyId } = await seedProposalPendingReview(studyFeatures.uniqueTitle('header-spacing'))

        await expectHeaderSpacing(page, Routes.studyReview({ orgSlug: ENCLAVE_SLUG, studyId }))
        await withRole(browser, 'researcher', (researcherPage) =>
            expectHeaderSpacing(researcherPage, Routes.studySubmitted({ orgSlug: LAB_SLUG, studyId })),
        )
    })

    test('sits 40px from the top and 32px above the first card on the dashboards', async ({ page }) => {
        await expectHeaderSpacing(page, Routes.dashboard)
        await expectHeaderSpacing(page, Routes.orgDashboard({ orgSlug: ENCLAVE_SLUG }))
    })

    // Only an account in both a Research Lab and a Data Partner sees the switcher.
    test('puts the My studies switcher 32px below the title and 16px above the studies card', async ({ browser }) => {
        await withRole(browser, 'admin', async (page) => {
            await goto(page, Routes.dashboard)
            const switcher = page.getByRole('main').getByRole('radiogroup')
            await expect(switcher).toBeVisible()

            await expect(async () => {
                const { aboveSwitcher, belowSwitcher } = await switcher.evaluate((el) => {
                    const header = el
                        .closest('main')
                        ?.querySelector('[data-testid="page-header-eyebrow"]')?.parentElement
                    const card = el.nextElementSibling
                    if (!header || !card) return { aboveSwitcher: NaN, belowSwitcher: NaN }

                    const box = el.getBoundingClientRect()
                    return {
                        aboveSwitcher: box.top - header.getBoundingClientRect().bottom,
                        belowSwitcher: card.getBoundingClientRect().top - box.bottom,
                    }
                })

                expect(aboveSwitcher).toBeCloseTo(32, 0)
                expect(belowSwitcher).toBeCloseTo(16, 0)
            }).toPass()
        })
    })
})
