import { expect, test } from '../fixtures'

// Uploads are presigned POSTs straight from the browser to the bucket, so the bucket's CORS policy
// must answer for this origin: the exact preflight a browser sends. On Dev a missing origin once
// surfaced as a bare "Failed to fetch" on every upload (RUNBOOK-slot-cutover.md, Phase 3 check 4).

test('the app bucket accepts uploads from this origin', async ({ page, request, target }) => {
    await page.goto('/about', { waitUntil: 'domcontentloaded' })
    const bucket = (
        await page.getByText('S3 Bucket:', { exact: true }).locator('xpath=following-sibling::*[1]').innerText()
    ).trim()
    expect(bucket, 'the about page names the bucket').toMatch(/^[a-z0-9.-]+$/)

    const preflight = await request.fetch(`https://${bucket}.s3.us-east-1.amazonaws.com/`, {
        method: 'OPTIONS',
        headers: { Origin: target.baseURL, 'Access-Control-Request-Method': 'POST' },
        maxRedirects: 0,
    })
    expect(preflight.status(), await preflight.text()).toBe(200)
    expect(preflight.headers()['access-control-allow-origin']).toBe(target.baseURL)
})
