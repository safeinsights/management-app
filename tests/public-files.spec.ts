import { authFileFor, expect, test } from './e2e.helpers'

const ROBOTS_TXT = 'User-agent: *\nDisallow: /\n'

// maxRedirects: 0 surfaces a redirect as the status. Following it would land on an HTML page that
// also answers 200 and hide the bug.
test.describe('public files', () => {
    test('serves robots.txt to a signed-out crawler', async ({ request }) => {
        const res = await request.get('/robots.txt', { maxRedirects: 0 })

        expect(res.status()).toBe(200)
        expect(await res.text()).toBe(ROBOTS_TXT)
    })

    test.describe('signed in without SI admin', () => {
        test.use({ storageState: authFileFor('reviewer') })

        // The org guard reads the first path segment as an org slug, so a member who is not an SI
        // admin was sent to the dashboard.
        test('serves robots.txt instead of redirecting to the dashboard', async ({ request }) => {
            const res = await request.get('/robots.txt', { maxRedirects: 0 })

            expect(res.status()).toBe(200)
            expect(await res.text()).toBe(ROBOTS_TXT)
        })
    })
})
