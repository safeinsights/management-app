import { expect, test, visitClerkProtectedPage, fs } from './e2e.helpers'
import type { Page } from '@playwright/test'

// re-use the same worker between the tests inside the describe block
// this ensures they run in order and will share the study title
test.describe.configure({ mode: 'serial' })

// must use object, see https://playwright.dev/docs/test-fixtures and https://playwright.dev/docs/test-parameterize
// eslint-disable-next-line no-empty-pattern
test.beforeEach(async ({}, testInfo) => {
    // Extend timeout for all tests running this hook by 30 seconds.
    testInfo.setTimeout(testInfo.timeout + 30_000)
})

// Helper function to compare two files
async function compareFiles(file1Path: string, file2Path: string): Promise<boolean> {
    const file1 = await fs.promises.readFile(file1Path)
    const file2 = await fs.promises.readFile(file2Path)
    return Buffer.compare(file1, file2) === 0
}

// Helper function to test file downloads
async function verifyStudyFileDownloads(page: Page, expectedPdfPath: string) {
    // Test downloading study documents (IRB, Description, Agreement)
    const documentBadges = page.locator('a[href*="/dl/study-documents/"]')

    // Wait for at least one document badge to appear
    await documentBadges.first().waitFor({ state: 'visible', timeout: 10000 })

    const documentCount = await documentBadges.count()
    expect(documentCount).toBeGreaterThan(0)

    for (let i = 0; i < documentCount; i++) {
        // Get the href for the document
        const href = await documentBadges.nth(i).getAttribute('href')
        expect(href).toBeTruthy()

        // Use HTTP request to fetch the file directly instead of clicking
        const response = await page.request.get(href!)
        expect(response.ok()).toBe(true)

        // Save the response to a temp file
        const tempPath = `/tmp/playwright-download-${Date.now()}-${i}.pdf`
        const buffer = await response.body()
        await fs.promises.writeFile(tempPath, buffer)

        // Verify the downloaded PDF matches the original empty.pdf
        const filesMatch = await compareFiles(tempPath, expectedPdfPath)
        expect(filesMatch).toBe(true)

        // Clean up temp file
        await fs.promises.unlink(tempPath)
    }

    // Test downloading code files (main.r and additional files)
    const codeBadges = page.locator('a[href*="/dl/study-code/"]')
    const codeCount = await codeBadges.count()

    if (codeCount > 0) {
        for (let i = 0; i < codeCount; i++) {
            // Get the href and filename from the badge
            const href = await codeBadges.nth(i).getAttribute('href')
            expect(href).toBeTruthy()

            // Extract filename from href (e.g., /dl/study-code/{jobId}/main.r -> main.r)
            const filename = href!.split('/').pop()!

            // Use HTTP request to fetch the file directly
            const response = await page.request.get(href!)
            expect(response.ok()).toBe(true)

            // Save the response to a temp file
            const tempPath = `/tmp/playwright-download-${Date.now()}-${filename}`
            const buffer = await response.body()
            await fs.promises.writeFile(tempPath, buffer)

            // Verify the content matches the original uploaded file
            if (filename === 'main.r') {
                const originalContent = await fs.promises.readFile('tests/assets/main.r', 'utf8')
                const downloadedContent = await fs.promises.readFile(tempPath, 'utf8')
                expect(downloadedContent).toBe(originalContent)
            } else if (filename === 'main.py') {
                const originalContent = await fs.promises.readFile('tests/assets/main.py', 'utf8')
                const downloadedContent = await fs.promises.readFile(tempPath, 'utf8')
                expect(downloadedContent).toBe(originalContent)
            } else if (filename === 'code.r') {
                const originalContent = await fs.promises.readFile('tests/assets/code.r', 'utf8')
                const downloadedContent = await fs.promises.readFile(tempPath, 'utf8')
                expect(downloadedContent).toBe(originalContent)
            }

            // Clean up temp file
            await fs.promises.unlink(tempPath)
        }
    }
}

async function viewDetails(page: Page, studyTitle: string) {
    const studyRow = page.getByRole('row').filter({ hasText: studyTitle })
    await expect(studyRow).toBeVisible({ timeout: 15000 })
    await studyRow.getByRole('link', { name: 'View' }).first().click()
    // The page heading varies: "Study Details" (submitted) or "Review your submission" (draft)
    await expect(page.getByRole('heading', { name: /Study Details|Review your submission/i })).toBeVisible()
}

type FillStudyFormOptions = {
    title: string
    investigator?: string
    orgNameRegex?: RegExp
}

async function fillStudyForm(page: Page, options: FillStudyFormOptions) {
    const { title, investigator = 'Ricky McResearcher', orgNameRegex = /openstax/i } = options

    await expect(page.getByText('Step 1 of 5')).toBeVisible()
    const orgSelect = page.getByTestId('org-select')
    await orgSelect.waitFor({ state: 'visible' })

    await page.waitForTimeout(1000)
    await expect(orgSelect).toBeEnabled()
    await orgSelect.click()
    await page.getByRole('option', { name: orgNameRegex }).click()

    await page.getByLabel(/title/i).fill(title)
    await page.getByLabel(/investigator/i).fill(investigator)

    await page.setInputFiles('input[type="file"][name="irbDocument"]', 'tests/assets/empty.pdf')
    await page.setInputFiles('input[type="file"][name="descriptionDocument"]', 'tests/assets/empty.pdf')
    await page.setInputFiles('input[type="file"][name="agreementDocument"]', 'tests/assets/empty.pdf')
}

type StudyLanguageConfig = {
    language: 'R' | 'Python'
    radioName: string
    mainCodeFile: string
    titleSuffix?: string
    // Optional: override which data organization to select in Step 1
    // Defaults to /openstax/i to keep existing tests unchanged.
    dataOrgNameRegex?: RegExp
}

// Helper to create a study with the given language configuration
async function createStudy(page: Page, studyTitle: string, languageConfig: StudyLanguageConfig): Promise<string> {
    const finalTitle = languageConfig.titleSuffix ? `${studyTitle} - ${languageConfig.titleSuffix}` : studyTitle

    await visitClerkProtectedPage({ page, role: 'researcher', url: '/openstax-lab/dashboard' })

    await page.getByTestId('new-study').first().click()

    await fillStudyForm(page, {
        title: finalTitle,
        orgNameRegex: languageConfig.dataOrgNameRegex,
    })

    // Verify "Save and proceed to upload" button is disabled when no programming language is selected
    const nextStepButton = page.getByRole('button', { name: /Save and proceed/ })
    await expect(nextStepButton).toBeDisabled()

    // Wait for the programming language radio button to be visible (after base images load)
    const radioButton = page.getByRole('radio', { name: languageConfig.radioName, exact: true })
    await radioButton.waitFor({ state: 'visible', timeout: 10000 })

    // Select programming language
    await radioButton.click()

    // Verify "Save and proceed to upload" button is now enabled after language selection
    await expect(nextStepButton).toBeEnabled()

    await nextStepButton.click()

    // Wait for the upload page to load
    await page.waitForURL('**/upload', { timeout: 15000 })

    // Click "Upload your files" button to open the modal
    await page.getByRole('button', { name: /Upload your files/i }).click()

    // Wait for the modal to open
    await expect(page.getByRole('dialog')).toBeVisible()

    // Upload files via the Dropzone file input
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles([languageConfig.mainCodeFile, 'tests/assets/code.r'])

    // Select the main code file (e.g., main.r or main.py)
    const mainFileName = languageConfig.mainCodeFile.split('/').pop()!
    await page.getByRole('radio', { name: mainFileName }).click()

    // Click "Done" to close the modal
    await page.getByRole('button', { name: 'Done' }).click()

    // Wait for the modal to close and navigation to select-files page
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await page.waitForURL('**/select-files**', { timeout: 15000 })

    // Wait for the submit button to appear on the select-files page
    await expect(page.getByRole('button', { name: 'Submit Study' })).toBeVisible()

    // Click submit and wait for navigation
    await page.getByRole('button', { name: 'Submit Study' }).click()

    // Wait until redirected to user dashboard
    await page.waitForURL('**/dashboard', { timeout: 15000 })

    // Navigate back to the org-specific dashboard where we started
    await page.goto('/openstax-lab/dashboard')

    // Wait for the table to render - use the "Proposed Studies" title as indicator
    await expect(page.getByRole('heading', { name: 'Proposed Studies' })).toBeVisible({ timeout: 15000 })

    return finalTitle
}

test('Single-language R org auto-selects language and enables Next Step', async ({ page }) => {
    await visitClerkProtectedPage({ page, role: 'researcher', url: '/openstax-lab/dashboard' })

    await page.getByTestId('new-study').first().click()

    await fillStudyForm(page, {
        title: 'Single-lang R study',
        orgNameRegex: /single-lang r enclave/i,
    })

    // Wait for programming language section to appear
    const helperText = page.getByText(
        /At the present Single-Lang R Enclave only supports R\. Code files submitted in other languages will not be able to run\./i,
    )
    await expect(helperText).toBeVisible()

    // Save and proceed to step 4 should already be enabled (no manual language click required)
    const nextStepButton = page.getByRole('button', { name: /Save and proceed/ })
    await expect(nextStepButton).toBeEnabled()

    // And clicking it should take us to the upload step
    await nextStepButton.click()
    await expect(page.getByText('Upload your files')).toBeVisible()
})

test('Creating and reviewing a study', async ({ page, studyFeatures }) => {
    await test.step('researcher creates a study', async () => {
        const studyTitle = await createStudy(page, studyFeatures.studyTitle, {
            language: 'R',
            radioName: 'R',
            mainCodeFile: 'tests/assets/main.r',
        })

        await viewDetails(page, studyTitle)
        await verifyStudyFileDownloads(page, 'tests/assets/empty.pdf')
    })

    await test.step('reviewer reviews and approves the study', async () => {
        await visitClerkProtectedPage({ page, role: 'reviewer', url: '/openstax/dashboard' })

        await expect(page.getByText('Review Studies')).toBeVisible()

        await viewDetails(page, studyFeatures.studyTitle)

        // Verify file downloads work before approving
        await verifyStudyFileDownloads(page, 'tests/assets/empty.pdf')

        await page.getByRole('button', { name: /approve/i }).click()

        await page.goto('/openstax/dashboard')

        await viewDetails(page, studyFeatures.studyTitle)

        await expect(page.getByText('Approved on')).toBeVisible()
    })
})

// TODO: Re-enable once modal file upload is implemented - the upload UI has been
// refactored to use a modal. This is going to be addressed in a related ticket
test.skip('Creating and reviewing a Python study', async ({ page, studyFeatures }) => {
    await test.step('researcher creates a Python study', async () => {
        const studyTitle = await createStudy(page, studyFeatures.studyTitle, {
            language: 'Python',
            radioName: 'Python',
            mainCodeFile: 'tests/assets/main.py',
            titleSuffix: 'Python',
        })

        await viewDetails(page, studyTitle)
        await verifyStudyFileDownloads(page, 'tests/assets/empty.pdf')
    })
})
