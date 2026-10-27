import { expect, goto, readTestSupportFile, reload, test, visitAsRole, withRole, type Page } from './e2e.helpers'
import { jobFileTypes, jobStatusRows, seedCodeApprovedJobReady, seedCodeEnv, seedCodeSubmitted } from './e2e.seed'
import { createWebhookClient } from './api/webhook-client'
import { RESEARCHER_DASHBOARD, REVIEWER_DASHBOARD, viewStudyDetails } from './flows/dashboard.flows'

// The CodeBuild callbacks (scanner, containerizer, code-environment scan), delivered in-process with
// the shared secret, and what each one changes for the people looking at the app.

test('scan verdicts reach the reviewer', { tag: '@webhook' }, async ({ browser, request, studyFeatures }) => {
    const passed = await seedCodeSubmitted(studyFeatures.uniqueTitle('scan-pass'))
    const failed = await seedCodeSubmitted(studyFeatures.uniqueTitle('scan-fail'))
    const webhooks = createWebhookClient(request)

    // The verdict is the first line; everything after it is the detail the reviewer can expand.
    const passLog = 'semgrep scan: no findings\nChecked 3 files.\nNo rules matched.\n'
    const failLog = 'semgrep scan: findings found\nERROR secret-in-source main.r:3\n'
    expect(
        (
            await webhooks.jobScanResults({ jobId: passed.jobId!, status: 'CODE-SCANNED', plaintextLog: passLog })
        ).status(),
    ).toBe(200)
    expect(
        (
            await webhooks.jobScanResults({
                jobId: failed.jobId!,
                status: 'CODE-SCANNED',
                plaintextLog: failLog,
                round: 1,
            })
        ).status(),
    ).toBe(200)

    // Stored twice: encrypted for the Data Partner's keys, and in the clear for the scan panel.
    expect(await jobFileTypes(passed.jobId!)).toEqual(
        expect.arrayContaining(['SECURITY-SCAN-LOG', 'ENCRYPTED-SECURITY-SCAN-LOG']),
    )
    expect((await jobStatusRows(passed.jobId!)).map((row) => row.status)).toContain('CODE-SCANNED')

    await withRole(browser, 'reviewer', async (page) => {
        await goto(page, `/openstax/study/${passed.studyId}/review`)
        const panel = page.getByTestId('security-scan-results')
        await expect(panel.getByRole('status')).toContainText('Semgrep: Passed')
        const toggle = panel.getByTestId('scan-details-toggle')
        if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
        await expect(panel.getByTestId('scan-details-body')).toContainText('Checked 3 files.')
        await expect(panel.getByTestId('scan-details-body')).not.toContainText('semgrep scan:')

        await goto(page, `/openstax/study/${failed.studyId}/review`)
        await expect(page.getByTestId('security-scan-results').getByRole('status')).toContainText('Semgrep: Failed')
    })
})

test(
    'a packaging failure reaches the reviewer with its log',
    { tag: '@webhook' },
    async ({ browser, request, studyFeatures }) => {
        const studyTitle = studyFeatures.uniqueTitle('packaging-error')
        const { jobId } = await seedCodeApprovedJobReady(studyTitle)
        const privateKey = await readTestSupportFile('private_key.pem')
        const webhooks = createWebhookClient(request)

        expect((await webhooks.containerizer({ jobId: jobId!, status: 'JOB-PACKAGING' })).status()).toBe(200)
        const errored = await webhooks.containerizer({
            jobId: jobId!,
            status: 'JOB-ERRORED',
            failureReason: 'BASE_IMAGE_UNAVAILABLE',
            plaintextLog: 'Base image public.ecr.aws/docker/library/r-base:latest could not be pulled.\n',
        })
        expect(errored.status(), await errored.text()).toBe(200)

        // The classification rides on the status row; the log is stored for both audiences.
        expect((await jobStatusRows(jobId!)).at(-1)).toMatchObject({
            status: 'JOB-ERRORED',
            message: 'BASE_IMAGE_UNAVAILABLE',
        })
        expect(await jobFileTypes(jobId!)).toEqual(
            expect.arrayContaining(['PACKAGING-ERROR-LOG', 'ENCRYPTED-PACKAGING-ERROR-LOG']),
        )

        await withRole(browser, 'reviewer', async (page) => {
            await visitAsRole(page, REVIEWER_DASHBOARD)
            await expect(page.getByRole('row').filter({ hasText: studyTitle }).getByText('Code errored')).toBeVisible()
            await viewStudyDetails(page, studyTitle)
            await expect(page.getByTestId('status-alert')).toContainText('Code errored')

            await page.getByTestId('security-key-form').getByRole('textbox', { name: 'Security key' }).fill(privateKey)
            await page.getByRole('button', { name: 'View' }).click()
            await expect(page.getByTestId('outputs-files-section')).toContainText('packaging-error-log.txt')
        })

        // Not disclosed to the lab before the Data Partner has looked at it.
        await withRole(browser, 'researcher', async (page) => {
            await visitAsRole(page, RESEARCHER_DASHBOARD)
            await expect(
                page.getByRole('row').filter({ hasText: studyTitle }).getByText('Awaiting outputs'),
            ).toBeVisible()
        })
    },
)

// The row has no role of its own: the innermost box around the row's "Details" button is it.
function codeEnvRow(page: Page, name: string) {
    return page
        .locator('div')
        .filter({ has: page.getByRole('button', { name: `Details for ${name}`, exact: true }) })
        .last()
}

test(
    'a code environment scan updates its badge and results',
    { tag: '@webhook' },
    async ({ browser, request, studyFeatures }) => {
        const suffix = studyFeatures.uniqueTitle('scan').replace(/\W+/g, '-').toLowerCase()
        const passing = await seedCodeEnv({
            orgSlug: 'reviewer-is-org-admin',
            name: `Env ${suffix}`,
            identifier: `e2e_${suffix}`,
        })
        const failing = await seedCodeEnv({
            orgSlug: 'reviewer-is-org-admin',
            name: `Env failing ${suffix}`,
            identifier: `e2e_fail_${suffix}`,
        })
        const webhooks = createWebhookClient(request)
        const results = 'EVERYTHING IS FINE!'

        await withRole(browser, 'reviewer', async (page) => {
            await visitAsRole(page, '/reviewer-is-org-admin/admin/settings')
            await expect(codeEnvRow(page, passing.name)).toContainText('Scan Pending')

            expect(
                (await webhooks.codeEnvScanResults({ codeEnvId: passing.codeEnvId, status: 'SCAN-RUNNING' })).status(),
            ).toBe(200)
            await reload(page)
            await expect(codeEnvRow(page, passing.name)).toContainText('Scanning...')

            expect(
                (
                    await webhooks.codeEnvScanResults({
                        codeEnvId: passing.codeEnvId,
                        status: 'SCAN-COMPLETE',
                        plaintextLog: results,
                    })
                ).status(),
            ).toBe(200)
            expect(
                (
                    await webhooks.codeEnvScanResults({
                        codeEnvId: failing.codeEnvId,
                        status: 'SCAN-FAILED',
                        plaintextLog: 'CRITICAL: CVE-2024-0001 in libssl',
                    })
                ).status(),
            ).toBe(200)
            await reload(page)
            await expect(codeEnvRow(page, failing.name)).toContainText('Scan Failed')

            // A finished scan's badge opens its report.
            await codeEnvRow(page, passing.name).getByText('Scan Passed').click()
            await expect(page.getByRole('dialog', { name: 'Scan Results' })).toContainText(results)
        })
    },
)

test('the webhooks refuse a wrong secret', { tag: '@webhook' }, async ({ request }) => {
    const webhooks = createWebhookClient(request, 'not-the-secret')
    const responses = await Promise.all([
        webhooks.jobScanResults({ jobId: '00000000-0000-0000-0000-000000000000', status: 'CODE-SCANNED' }),
        webhooks.containerizer({ jobId: '00000000-0000-0000-0000-000000000000', status: 'JOB-READY' }),
        webhooks.codeEnvScanResults({ codeEnvId: '00000000-0000-0000-0000-000000000000', status: 'SCAN-RUNNING' }),
    ])
    for (const response of responses) {
        expect(response.status()).toBe(401)
        expect(JSON.parse(await response.text())).toEqual({ error: 'unauthorized' })
    }
})
