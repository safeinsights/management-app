import { authFileFor, expect, goto, test } from './e2e.helpers'

// OTTER-734. The title comes from Next's metadata and the focus move from the router's commit
// order, neither of which the unit tests' router mock reproduces, so only a browser shows that a
// client-side navigation retitles the tab and lands focus on main.
test.describe('client-side navigation', () => {
    test.use({ storageState: authFileFor('reviewer') })

    test('retitles the tab and moves focus to main, going forward and coming back', async ({ page }) => {
        await goto(page, '/openstax/dashboard')
        await expect(page).toHaveTitle('Dashboard - SafeInsights')

        await page.getByRole('link', { name: 'Home', exact: true }).click()

        await expect(page).toHaveTitle('My dashboard - SafeInsights')
        await expect(page.locator('#main-content')).toBeFocused()

        // Parked on a shell control that survives the navigation, so only the hook can move it.
        await page.getByRole('button', { name: 'Toggle profile menu' }).focus()
        await page.goBack()

        await expect(page).toHaveTitle('Dashboard - SafeInsights')
        await expect(page.locator('#main-content')).toBeFocused()
    })
})
