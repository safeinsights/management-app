import { authFileFor, expect, goto, test } from './e2e.helpers'

// The pages around the app: the root, the build information, and the not-found view.

test.use({ storageState: authFileFor('reviewer') })

test('The root page sends a signed-in user to their studies', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForURL('/dashboard')
    await expect(page.getByRole('link', { name: 'My studies', exact: true })).toBeVisible()
})

test('The about page reports the build', async ({ page }) => {
    await goto(page, '/about')
    await expect(page.getByText('Release:', { exact: true })).toBeVisible()
    // A local build carries no release tag, editor release or infrastructure version.
    await expect(page.getByText('not deployed').first()).toBeVisible()
    await expect(page.getByText('Clerk Key:')).toBeVisible()
})

test('An unknown page under an org shows the not-found view', async ({ page }) => {
    await page.goto('/openstax/does-not-exist', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Page Not Found', level: 1 })).toBeVisible()
    await expect(page.getByText('Take me back')).toBeVisible()
})
