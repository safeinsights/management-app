import { expect, test } from '../fixtures'

// The front door: CloudFront in front of the app Lambda, the static assets behind the /assets/*
// behavior, and the build the environment says it is running. Nothing here signs in.

test('the app answers and names its build', async ({ page, request, target }) => {
    const root = await request.get('/', { maxRedirects: 0 })
    expect([302, 307, 308]).toContain(root.status())
    expect(root.headers()['location']).toContain('/account/signin')

    // Read from the rendered page: the server streams "Release" and ":" as separate text nodes.
    await page.goto('/about', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Release:', { exact: true })).toBeVisible()
    await expect(page.getByText('S3 Bucket:', { exact: true })).toBeVisible()
    // When the deploy passes the SHA or tag it just shipped, the page must agree.
    if (target.expectedRelease) await expect(page.getByText(target.expectedRelease)).toBeVisible()
})

test('the static assets are served through CloudFront', async ({ request }) => {
    const signin = await request.get('/account/signin')
    expect(signin.status()).toBe(200)
    const script = (await signin.text()).match(/(\/assets\/_next\/static\/[^"']+\.js)/)?.[1]
    expect(script, 'the sign-in page references at least one script under /assets').toBeTruthy()
    const asset = await request.get(script!)
    expect(asset.status()).toBe(200)
    expect(asset.headers()['content-type']).toContain('javascript')
})

test('client-side navigation reaches the app', async ({ roleContext }) => {
    const { page } = await roleContext('researcher')
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    // A React Server Components request (`_rsc`) is what a click costs; it must come back from the Lambda.
    const rsc = page.waitForResponse((response) => response.url().includes('_rsc=') && response.status() === 200)
    await page.getByRole('link', { name: 'My studies', exact: true }).first().click()
    await rsc
    await expect(page.getByRole('link', { name: 'My studies', exact: true }).first()).toBeVisible()
})
