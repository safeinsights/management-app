import { Routes } from '@/lib/routes/definitions'
import { authFileFor, expect, goto, test, type Page } from './e2e.helpers'
import { ENCLAVE_SLUG, seedProposalPendingReview } from './e2e.seed'
import { RESEARCHER_DASHBOARD } from './study.helpers'

// OTTER-734 and OTTER-823. Title, focus move and announcement all depend on Next's commit order,
// which the unit tests' router mock does not reproduce, so only a browser shows that a client-side
// navigation retitles the tab, announces the new title and lands focus on main.

type AnnouncedWindow = Window & { announced?: string[] }

// Every value the announcer held, so a brief wrong announcement fails even when the right one follows.
const recordAnnouncements = (page: Page) =>
    page.evaluate(() => {
        const region = document.querySelector('[data-testid="route-announcer"]')
        if (!region) throw new Error('route announcer is not mounted')
        const win = window as AnnouncedWindow
        win.announced = []
        new MutationObserver(() => {
            if (region.textContent) win.announced?.push(region.textContent.trim())
        }).observe(region, { childList: true, subtree: true, characterData: true })
    })

const announcements = (page: Page) => page.evaluate(() => (window as AnnouncedWindow).announced)

test.describe('client-side navigation', () => {
    test.use({ storageState: authFileFor('reviewer') })

    test('retitles the tab, announces the title and moves focus to main, going forward and coming back', async ({
        page,
    }) => {
        await goto(page, Routes.orgDashboard({ orgSlug: ENCLAVE_SLUG }))
        await expect(page).toHaveTitle('Dashboard - SafeInsights')

        // Anchored rather than exact: any study another spec seeds unopened adds "Updated" to the name.
        await page.getByRole('link', { name: /^My studies( Updated)?$/ }).click()

        await expect(page).toHaveTitle('My studies - SafeInsights')
        await expect(page.locator('#main-content')).toBeFocused()
        await expect(page.getByTestId('route-announcer')).toHaveText('My studies - SafeInsights')
        // Hidden, so screen readers hear the app's announcement and not Next's H1 fallback as well.
        await expect(page.locator('next-route-announcer')).toHaveCSS('display', 'none')

        // Parked on a shell control that survives the navigation, so only the hook can move it.
        await page.getByRole('button', { name: 'profile menu' }).focus()
        await page.goBack()

        await expect(page).toHaveTitle('Dashboard - SafeInsights')
        await expect(page.locator('#main-content')).toBeFocused()
        await expect(page.getByTestId('route-announcer')).toHaveText('Dashboard - SafeInsights')
    })
})

// QA's failing journey: a researcher opening a study from the dashboard, where the study's heading
// was announced instead of the page title, on a fresh link and on one already visited.
test.describe('client-side navigation into a study', () => {
    test.use({ storageState: authFileFor('researcher') })

    test('announces each page title and never the study heading', async ({ page, studyFeatures }) => {
        const title = studyFeatures.uniqueTitle('route announcer')
        await seedProposalPendingReview(title)
        await goto(page, RESEARCHER_DASHBOARD)
        const studyLink = page.getByRole('row').filter({ hasText: title }).getByRole('link', { name: title })
        await expect(studyLink).toBeVisible()
        await recordAnnouncements(page)
        // Each step waits to be heard, as a listener would; a title replaced inside the hold is never spoken.
        const announcer = page.getByTestId('route-announcer')

        await studyLink.click()
        await expect(announcer).toHaveText('Submit proposal - SafeInsights')
        await page.goBack()
        await expect(announcer).toHaveText('Dashboard - SafeInsights')
        await studyLink.click()
        await expect(announcer).toHaveText('Submit proposal - SafeInsights')
        await page.goBack()
        await expect(announcer).toHaveText('Dashboard - SafeInsights')
        await page.goForward()
        await expect(announcer).toHaveText('Submit proposal - SafeInsights')

        await expect
            .poll(() => announcements(page))
            .toEqual([
                'Submit proposal - SafeInsights',
                'Dashboard - SafeInsights',
                'Submit proposal - SafeInsights',
                'Dashboard - SafeInsights',
                'Submit proposal - SafeInsights',
            ])
    })
})
