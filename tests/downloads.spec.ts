import type { APIRequestContext } from '@playwright/test'
import { authFileFor, expect, fs, goto, test } from './e2e.helpers'
import { seedApprovedWithAcknowledgedStudyAgreementPdf, seedCodeSubmitted } from './e2e.seed'
import { createWebhookClient } from './api/webhook-client'

// The /dl/* routes: each authorises the session, then answers a 307 to a presigned object URL. The
// `request` fixture carries the role's storageState, so it is the signed-in user the route sees.

// Without following the redirect, so the route's own answer is what gets asserted.
async function expectPresignedRedirect(request: APIRequestContext, url: string) {
    const response = await request.get(url, { maxRedirects: 0 })
    expect(response.status(), await response.text()).toBe(307)
    const location = response.headers()['location']
    expect(location).toContain('X-Amz-Signature=')
    return location
}

test.describe('as the reviewer', () => {
    test.use({ storageState: authFileFor('reviewer') })

    // No screen links to this route yet; the scanner's log reaches the reviewer through it all the same.
    test('the security scan log downloads as a named attachment', async ({ request, studyFeatures }) => {
        const { jobId } = await seedCodeSubmitted(studyFeatures.uniqueTitle('scan-log-dl'))
        const plaintextLog = 'semgrep scan: no findings\nChecked 2 files, 0 findings.\n'
        const stored = await createWebhookClient(request).jobScanResults({
            jobId: jobId!,
            status: 'CODE-SCANNED',
            plaintextLog,
        })
        expect(stored.status(), await stored.text()).toBe(200)

        const location = await expectPresignedRedirect(request, `/dl/scan-log/${jobId}`)
        expect(decodeURIComponent(location)).toContain('attachment; filename="security-scan-log.txt"')
        const object = await request.get(location)
        expect(object.status()).toBe(200)
        expect(await object.text()).toBe(plaintextLog)
    })

    test('a submitted code file downloads from the code viewer', async ({ page, request, studyFeatures }) => {
        const { studyId, jobId } = await seedCodeSubmitted(studyFeatures.uniqueTitle('code-dl'))

        await goto(page, `/openstax/study/${studyId}/review`)
        await expect(page.locator('code').filter({ hasText: 'osenclave::initialize()' }).first()).toBeVisible()
        const download = page.getByTestId('study-code-download')
        await expect(download).toHaveAttribute('href', `/dl/study-code/${jobId}/analysis.r`)

        const location = await expectPresignedRedirect(request, `/dl/study-code/${jobId}/analysis.r`)
        const object = await request.get(location)
        expect(object.status()).toBe(200)
        expect(await object.text()).toBe(fs.readFileSync('tests/fixtures/code-samples/analysis.r', 'utf8'))
    })
})

test.describe('as the researcher', () => {
    test.use({ storageState: authFileFor('researcher') })

    test('an acknowledged Study Agreement opens from the legal page', async ({ page, request, studyFeatures }) => {
        const studyTitle = studyFeatures.uniqueTitle('sla-dl')
        const { versionId } = await seedApprovedWithAcknowledgedStudyAgreementPdf(studyTitle)

        await goto(page, '/legal')
        await page.getByRole('tab', { name: 'Study Agreement' }).click()
        const row = page.getByRole('row').filter({ hasText: studyTitle })
        const link = row.getByRole('link', { name: 'PDF' })
        await expect(link).toHaveAttribute('href', `/dl/legal/${versionId}`)
        await expect(link).toHaveAttribute('target', '_blank')

        const location = await expectPresignedRedirect(request, `/dl/legal/${versionId}`)
        expect(decodeURIComponent(location)).toContain('inline; filename="study-agreement.pdf"')
        const object = await request.get(location)
        expect(object.status()).toBe(200)
        expect(object.headers()['content-type']).toContain('application/pdf')
        expect((await object.body()).equals(fs.readFileSync('tests/assets/empty.pdf'))).toBe(true)
    })
})
