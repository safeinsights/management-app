import { expect, test, visitClerkProtectedPage, readTestSupportFile, goto } from './e2e.helpers'
import type { Page } from '@playwright/test'
import jwt from 'jsonwebtoken'
import { execSync } from 'child_process'

test.describe.configure({ mode: 'serial' })

// eslint-disable-next-line no-empty-pattern
test.beforeEach(async ({}, testInfo) => {
    testInfo.setTimeout(testInfo.timeout + 120_000)
})

// ============================================================================
// Spy mode helpers
// ============================================================================

async function enableSpyMode(page: Page) {
    const body = page.locator('body')
    const currentClass = await body.getAttribute('class')
    if (currentClass?.includes('spy-mode')) return

    await page.locator('.pi-symbol').click({ force: true })
    await expect(body).toHaveClass(/spy-mode/)
}

// ============================================================================
// Lexical editor helpers
// ============================================================================

async function fillLexicalEditor(page: Page, ariaLabel: string, text: string) {
    const editor = page.locator(`[aria-label="${ariaLabel}"][contenteditable="true"]`)
    await editor.click()
    await page.keyboard.type(text)
}

// ============================================================================
// Step 1: Request page (new flow)
// ============================================================================

async function fillStep1NewFlow(page: Page) {
    await visitClerkProtectedPage({ page, role: 'researcher', url: '/openstax-lab/dashboard' })

    const newStudyButton = page.getByTestId('new-study').first()
    await newStudyButton.waitFor({ state: 'visible', timeout: 30000 })
    await newStudyButton.click()

    await enableSpyMode(page)

    const orgSelect = page.getByTestId('org-select')
    await orgSelect.waitFor({ state: 'visible' })
    await page.waitForTimeout(1000)
    await expect(orgSelect).toBeEnabled()
    await orgSelect.click()
    await page.getByRole('option', { name: /openstax/i }).click()

    const radioButton = page.getByRole('radio', { name: 'R', exact: true })
    await radioButton.waitFor({ state: 'visible', timeout: 10000 })
    await radioButton.click()

    const proceedButton = page.getByRole('button', { name: /Proceed to Step 2/i })
    await expect(proceedButton).toBeEnabled()
    await proceedButton.click()

    await page.waitForURL(/\/proposal$/, { timeout: 30000 })
}

// ============================================================================
// Step 2: Proposal form (new flow)
// ============================================================================

async function fillProposalForm(page: Page, studyTitle: string) {
    await page.getByLabel('Study Title').fill(studyTitle)

    await fillLexicalEditor(page, 'Research question(s)', 'What is the effect of highlighting on student outcomes?')
    await fillLexicalEditor(
        page,
        'Project summary',
        'This study examines how highlighting correlates with performance using archival data.',
    )
    await fillLexicalEditor(
        page,
        'Impact',
        'Results could improve understanding of student engagement with textbook content.',
    )

    const piSelect = page.getByRole('textbox', { name: 'Principal Investigator' })
    await piSelect.click()
    await page.getByRole('option').first().click()

    const submitButton = page.getByRole('button', { name: /Submit study proposal/i })
    await expect(submitButton).toBeEnabled({ timeout: 5000 })
    await submitButton.click()

    await page.waitForURL(/\/submitted$/, { timeout: 30000 })
}

// ============================================================================
// Job / error helpers (copied from study-flow.spec.ts)
// ============================================================================

async function createOrgAuthToken(orgSlug: string = 'openstax'): Promise<string> {
    const privateKeyPem = await readTestSupportFile('private_key.pem')
    const payload = {
        iss: orgSlug,
        exp: Math.floor(Date.now() / 1000) + 60 * 60,
    }
    const token = jwt.sign(payload, privateKeyPem, { algorithm: 'RS256' })
    return `Bearer ${token}`
}

function extractStudyIdFromUrl(page: Page): string {
    const url = page.url()
    const match = url.match(/\/study\/([^/]+)/)
    if (!match) throw new Error(`Could not extract study ID from URL: ${url}`)
    return match[1]
}

async function waitForJobReady(page: Page, studyId: string, authToken: string): Promise<string> {
    const baseUrl = 'http://localhost:4000'
    for (let i = 0; i < 30; i++) {
        const response = await page.request.get(`${baseUrl}/api/studies/ready`, {
            headers: { Authorization: authToken },
        })
        if (response.ok()) {
            const data = (await response.json()) as { jobs: Array<{ studyId: string; jobId: string }> }
            const job = data.jobs?.find((j) => j.studyId === studyId)
            if (job) return job.jobId
        }
        await page.waitForTimeout(1000)
    }
    throw new Error(`Job for study ${studyId} did not become ready within 30 seconds`)
}

function uploadErrorLogs(jobId: string): void {
    const cmd = `npx tsx bin/debug/upload-results.ts -j ${jobId} -l tests/assets/error-log.txt`
    execSync(cmd, { stdio: 'inherit' })
}

// ============================================================================
// IDE upload helper (new flow)
// ============================================================================

async function uploadCodeViaIDENewFlow(page: Page) {
    const launchButton = page.getByRole('button', { name: /Launch IDE/i })

    await Promise.all([page.waitForEvent('popup', { timeout: 5000 }).catch(() => null), launchButton.click()])

    // Wait for files to appear (auto-sync from Coder workspace)
    await expect(page.getByText(/main.r/i)).toBeVisible({ timeout: 15000 })

    // New flow: "Submit code" directly submits (no review page)
    await page.getByRole('button', { name: /Submit code/i }).click()

    await page.waitForURL(/\/dashboard$/, { timeout: 30000 })
}

// ============================================================================
// Tests
// ============================================================================

test('New flow: full lifecycle via file upload', async ({ page, studyFeatures }) => {
    const studyTitle = `${studyFeatures.studyTitle} - new`

    await test.step('Step 1 — researcher fills request page', async () => {
        await fillStep1NewFlow(page)

        // Verify request page had the correct headings/labels before navigating
        // (we're now on /proposal, so just verify the URL)
        expect(page.url()).toMatch(/\/proposal$/)
    })

    await test.step('Step 2 — researcher fills proposal form', async () => {
        await enableSpyMode(page)

        await expect(page.getByText('STEP 2')).toBeVisible()

        await fillProposalForm(page, studyTitle)
    })

    await test.step('Submitted page — researcher sees success', async () => {
        await enableSpyMode(page)

        await expect(page.getByText(/submitted successfully/i)).toBeVisible({ timeout: 10000 })

        await page.getByRole('link', { name: /Go to dashboard/i }).click()
        await page.waitForURL(/\/dashboard$/, { timeout: 15000 })
    })

    await test.step('Reviewer approves proposal', async () => {
        await visitClerkProtectedPage({ page, role: 'reviewer', url: '/openstax/dashboard' })
        await enableSpyMode(page)

        await expect(page.getByText('Review Studies')).toBeVisible()

        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible({ timeout: 15000 })
        const viewLink = studyRow.getByRole('link', { name: 'View' }).first()
        await viewLink.click()

        // Should land on ProposalReviewView
        await expect(page.getByText('STEP 1', { exact: true })).toBeVisible({ timeout: 10000 })
        await expect(page.getByText(studyTitle)).toBeVisible()

        await page.getByRole('button', { name: /Approve request/i }).click()
        await page.waitForURL(/\/dashboard$/, { timeout: 15000 })
    })

    await test.step('Researcher sees agreements and navigates to code upload', async () => {
        await visitClerkProtectedPage({ page, role: 'researcher', url: '/openstax-lab/dashboard' })
        await enableSpyMode(page)

        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible({ timeout: 15000 })
        const viewLink = studyRow.getByRole('link', { name: 'View' }).first()
        await viewLink.click()

        // Should land on agreements page
        await page.waitForURL(/\/agreements$/, { timeout: 15000 })

        await expect(page.getByText('STEP 3A')).toBeVisible({ timeout: 10000 })
        await expect(page.getByText('STEP 3B')).toBeVisible()
        await expect(page.getByText('STEP 3C')).toBeVisible()

        await page.getByRole('button', { name: /Proceed to Step 4/i }).click()
        await page.waitForURL(/\/code$/, { timeout: 15000 })

        await expect(page.getByText('STEP 4 of 4')).toBeVisible({ timeout: 10000 })
    })

    await test.step('Researcher uploads code and submits', async () => {
        await page.getByRole('button', { name: /Upload your files/i }).click()
        await expect(page.getByRole('dialog')).toBeVisible()

        const fileInput = page.locator('input[type="file"]')
        await fileInput.setInputFiles(['tests/coder-files/main.r', 'tests/coder-files/code.r'])

        await page.getByRole('button', { name: 'Done' }).click()
        await expect(page.getByRole('dialog')).not.toBeVisible()

        // Review uploaded files page
        await expect(page.getByRole('heading', { name: /Review uploaded files/i })).toBeVisible({ timeout: 10000 })

        await page.getByRole('radio', { name: 'main.r' }).click()

        // In new flow, "Submit code" directly submits (no review page)
        await page.getByRole('button', { name: /Submit code/i }).click()

        await page.waitForURL(/\/dashboard$/, { timeout: 30000 })
    })

    await test.step('Reviewer sees code review and agreements pages', async () => {
        await visitClerkProtectedPage({ page, role: 'reviewer', url: '/openstax/dashboard' })
        await enableSpyMode(page)

        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible({ timeout: 15000 })

        // Extract the study URL from the View link
        const viewLink = studyRow.getByRole('link', { name: 'View' }).first()
        const href = await viewLink.getAttribute('href')
        const studyBaseUrl = href!.replace(/\/(review|view|agreements)$/, '')

        // Navigate to /review and poll until CodeReviewView appears.
        // The security scan runs async after code submission (~30s),
        // so we reload until the page reflects CODE-SCANNED status.
        await goto(page, `${studyBaseUrl}/review`)
        await enableSpyMode(page)

        // Poll-reload until CodeReviewView appears. We check for the "Study Details"
        // heading (unique to CodeReviewView) rather than the Approve button, because
        // ProposalReviewView's "Approve request" also matches /Approve/i.
        const studyDetailsHeading = page.getByRole('heading', { name: /Study Details/i })
        for (let attempt = 0; attempt < 12; attempt++) {
            if (await studyDetailsHeading.isVisible().catch(() => false)) break
            await page.waitForTimeout(5000)
            await goto(page, `${studyBaseUrl}/review`)
            await enableSpyMode(page)
        }

        // CodeReviewView headings
        await expect(studyDetailsHeading).toBeVisible({ timeout: 10000 })
        await expect(page.getByRole('heading', { name: /Study Code/i })).toBeVisible()

        // Wait for security scan to complete (Approve button requires CODE-SCANNED)
        const approveButton = page.getByRole('button', { name: /Approve/i })
        await expect(approveButton).toBeVisible({ timeout: 45000 })

        // Now verify the agreements page renders correctly for the reviewer
        await goto(page, `${studyBaseUrl}/agreements`)
        await enableSpyMode(page)

        await expect(page.getByText('STEP 2A')).toBeVisible({ timeout: 10000 })
        await expect(page.getByText('STEP 2B')).toBeVisible()
        await expect(page.getByText('STEP 2C')).toBeVisible()

        // Navigate back to review and approve
        await goto(page, `${studyBaseUrl}/review`)
        await enableSpyMode(page)

        await page.getByRole('button', { name: /Approve/i }).click()
        await page.waitForURL(/\/dashboard$/, { timeout: 15000 })
    })

    await test.step('Researcher views submitted study', async () => {
        await visitClerkProtectedPage({ page, role: 'researcher', url: '/openstax-lab/dashboard' })
        await enableSpyMode(page)

        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible({ timeout: 15000 })
        const viewLink = studyRow.getByRole('link', { name: 'View' }).first()
        await viewLink.click()

        // CodeOnlyView headings
        await expect(page.getByRole('heading', { name: /Study Details/i })).toBeVisible({ timeout: 10000 })
        await expect(page.getByRole('heading', { name: /Study Code/i })).toBeVisible()
        await expect(page.getByRole('heading', { name: /Study Status/i })).toBeVisible()
    })

    await test.step('Error handling — reviewer sees errored status', async () => {
        const authToken = await createOrgAuthToken('openstax')
        const studyId = extractStudyIdFromUrl(page)

        const jobId = await waitForJobReady(page, studyId, authToken)
        uploadErrorLogs(jobId)

        // Reviewer sees Errored on dashboard
        await visitClerkProtectedPage({ page, role: 'reviewer', url: '/openstax/dashboard' })
        await enableSpyMode(page)

        const reviewerRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(reviewerRow.getByText(/Errored/i)).toBeVisible({ timeout: 15000 })
    })
})

test('New flow: full lifecycle via IDE', async ({ page, studyFeatures }) => {
    const studyTitle = `${studyFeatures.studyTitle} - ide`

    await test.step('Step 1 — researcher fills request page', async () => {
        await fillStep1NewFlow(page)
        expect(page.url()).toMatch(/\/proposal$/)
    })

    await test.step('Step 2 — researcher fills proposal form', async () => {
        await enableSpyMode(page)
        await expect(page.getByText('STEP 2')).toBeVisible()
        await fillProposalForm(page, studyTitle)
    })

    await test.step('Submitted page — researcher sees success', async () => {
        await enableSpyMode(page)
        await expect(page.getByText(/submitted successfully/i)).toBeVisible({ timeout: 10000 })
        await page.getByRole('link', { name: /Go to dashboard/i }).click()
        await page.waitForURL(/\/dashboard$/, { timeout: 15000 })
    })

    await test.step('Reviewer approves proposal', async () => {
        await visitClerkProtectedPage({ page, role: 'reviewer', url: '/openstax/dashboard' })
        await enableSpyMode(page)

        await expect(page.getByText('Review Studies')).toBeVisible()

        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible({ timeout: 15000 })
        const viewLink = studyRow.getByRole('link', { name: 'View' }).first()
        await viewLink.click()

        await expect(page.getByText('STEP 1', { exact: true })).toBeVisible({ timeout: 10000 })
        await expect(page.getByText(studyTitle)).toBeVisible()

        await page.getByRole('button', { name: /Approve request/i }).click()
        await page.waitForURL(/\/dashboard$/, { timeout: 15000 })
    })

    await test.step('Researcher sees agreements and navigates to code page', async () => {
        await visitClerkProtectedPage({ page, role: 'researcher', url: '/openstax-lab/dashboard' })
        await enableSpyMode(page)

        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible({ timeout: 15000 })
        const viewLink = studyRow.getByRole('link', { name: 'View' }).first()
        await viewLink.click()

        await page.waitForURL(/\/agreements$/, { timeout: 15000 })

        await expect(page.getByText('STEP 3A')).toBeVisible({ timeout: 10000 })
        await expect(page.getByText('STEP 3B')).toBeVisible()
        await expect(page.getByText('STEP 3C')).toBeVisible()

        await page.getByRole('button', { name: /Proceed to Step 4/i }).click()
        await page.waitForURL(/\/code$/, { timeout: 15000 })

        await expect(page.getByText('STEP 4 of 4')).toBeVisible({ timeout: 10000 })
    })

    await test.step('Researcher launches IDE and submits code', async () => {
        await uploadCodeViaIDENewFlow(page)
    })

    await test.step('Reviewer sees code review and agreements pages', async () => {
        await visitClerkProtectedPage({ page, role: 'reviewer', url: '/openstax/dashboard' })
        await enableSpyMode(page)

        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible({ timeout: 15000 })

        const viewLink = studyRow.getByRole('link', { name: 'View' }).first()
        const href = await viewLink.getAttribute('href')
        const studyBaseUrl = href!.replace(/\/(review|view|agreements)$/, '')

        await goto(page, `${studyBaseUrl}/review`)
        await enableSpyMode(page)

        const studyDetailsHeading = page.getByRole('heading', { name: /Study Details/i })
        for (let attempt = 0; attempt < 12; attempt++) {
            if (await studyDetailsHeading.isVisible().catch(() => false)) break
            await page.waitForTimeout(5000)
            await goto(page, `${studyBaseUrl}/review`)
            await enableSpyMode(page)
        }

        await expect(studyDetailsHeading).toBeVisible({ timeout: 10000 })
        await expect(page.getByRole('heading', { name: /Study Code/i })).toBeVisible()

        const approveButton = page.getByRole('button', { name: /Approve/i })
        await expect(approveButton).toBeVisible({ timeout: 45000 })

        await goto(page, `${studyBaseUrl}/agreements`)
        await enableSpyMode(page)

        await expect(page.getByText('STEP 2A')).toBeVisible({ timeout: 10000 })
        await expect(page.getByText('STEP 2B')).toBeVisible()
        await expect(page.getByText('STEP 2C')).toBeVisible()

        await goto(page, `${studyBaseUrl}/review`)
        await enableSpyMode(page)

        await page.getByRole('button', { name: /Approve/i }).click()
        await page.waitForURL(/\/dashboard$/, { timeout: 15000 })
    })

    await test.step('Researcher views submitted study', async () => {
        await visitClerkProtectedPage({ page, role: 'researcher', url: '/openstax-lab/dashboard' })
        await enableSpyMode(page)

        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible({ timeout: 15000 })
        const viewLink = studyRow.getByRole('link', { name: 'View' }).first()
        await viewLink.click()

        await expect(page.getByRole('heading', { name: /Study Details/i })).toBeVisible({ timeout: 10000 })
        await expect(page.getByRole('heading', { name: /Study Code/i })).toBeVisible()
        await expect(page.getByRole('heading', { name: /Study Status/i })).toBeVisible()
    })

    await test.step('Error handling — reviewer sees errored status', async () => {
        const authToken = await createOrgAuthToken('openstax')
        const studyId = extractStudyIdFromUrl(page)

        const jobId = await waitForJobReady(page, studyId, authToken)
        uploadErrorLogs(jobId)

        await visitClerkProtectedPage({ page, role: 'reviewer', url: '/openstax/dashboard' })
        await enableSpyMode(page)

        const reviewerRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(reviewerRow.getByText(/Errored/i)).toBeVisible({ timeout: 15000 })
    })
})

test('New flow: ProposalReviewView for study without code', async ({ page, studyFeatures }) => {
    const studyTitle = `${studyFeatures.studyTitle} - proposal-only`

    await test.step('Researcher creates study via new flow (Steps 1-3)', async () => {
        await fillStep1NewFlow(page)
        await enableSpyMode(page)
        await fillProposalForm(page, studyTitle)

        await enableSpyMode(page)
        await expect(page.getByText(/submitted successfully/i)).toBeVisible({ timeout: 10000 })
    })

    await test.step('Reviewer sees ProposalReviewView', async () => {
        await visitClerkProtectedPage({ page, role: 'reviewer', url: '/openstax/dashboard' })
        await enableSpyMode(page)

        const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
        await expect(studyRow).toBeVisible({ timeout: 15000 })
        const viewLink = studyRow.getByRole('link', { name: 'View' }).first()
        await viewLink.click()

        // ProposalReviewView assertions
        await expect(page.getByText('STEP 1', { exact: true })).toBeVisible({ timeout: 10000 })
        await expect(page.getByRole('heading', { name: /Review study proposal/i })).toBeVisible()

        // Proposal field labels
        await expect(page.getByText('Study title', { exact: true })).toBeVisible()
        await expect(page.getByText('Research question(s)', { exact: true })).toBeVisible()
        await expect(page.getByText('Project summary', { exact: true })).toBeVisible()
        await expect(page.getByText('Impact', { exact: true })).toBeVisible()
        await expect(page.getByText('Principal Investigator', { exact: true })).toBeVisible()

        // Approve / Reject buttons
        await expect(page.getByRole('button', { name: /Approve request/i })).toBeVisible()
        await expect(page.getByRole('button', { name: /Reject request/i })).toBeVisible()
    })
})
