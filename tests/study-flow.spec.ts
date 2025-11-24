import { expect, test, visitClerkProtectedPage, fs } from './e2e.helpers'
import type { Page } from '@playwright/test'

// re-use the same worker between the tests inside the describe block
// this ensures they run in order and will share the study title
test.describe.configure({ mode: 'serial' })

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
    await expect(page.getByRole('heading', { name: 'Study details' })).toBeVisible()
}

test('Creating and reviewing a study', async ({ page, studyFeatures }) => {
    await test.step('researcher creates a study', async () => {
        await visitClerkProtectedPage({ page, role: 'researcher', url: '/openstax-lab/dashboard' })

        // propose new study button
        await page.getByTestId('new-study').first().click()

        // wait for Step 1 panel to render and select openstax as the org for following steps
        await expect(page.getByText('Step 1 of 4')).toBeVisible()
        const orgSelect = page.getByTestId('org-select')
        await orgSelect.waitFor({ state: 'visible' })

        await page.waitForTimeout(1000)
        await expect(orgSelect).toBeEnabled()
        await orgSelect.click()
        await page.getByRole('option', { name: /openstax/i }).click()

        await page.getByLabel(/title/i).fill(studyFeatures.studyTitle)
        await page.getByLabel(/investigator/i).fill('Ricky McResearcher')

        // Invalid file testing
        // const invalidFileType = 'tests/assets/invalid.txt'
        // await page.setInputFiles('input[type="file"][name="codeFiles"]', invalidFileType)
        // await expect(page.getByText('File type must be one of .r, .rmd, .R')).toBeVisible()

        await page.setInputFiles('input[type="file"][name="irbDocument"]', 'tests/assets/empty.pdf')
        await page.setInputFiles('input[type="file"][name="descriptionDocument"]', 'tests/assets/empty.pdf')
        await page.setInputFiles('input[type="file"][name="agreementDocument"]', 'tests/assets/empty.pdf')

        // Select programming language (R)
        await page.getByRole('radio', { name: 'R', exact: true }).click()

        await page.getByRole('button', { name: 'Next Step' }).click()

        await expect(page.getByText('Upload File')).toBeVisible()

        //TODO: Test that will validate the upload without a main.r file
        //Test upload without main.r file
        // const missingMainFile = 'tests/assets/study-no-main.zip'
        // await page.setInputFiles('input[type="file"]', missingMainFile)
        // await expect(page.getByText('A file named "main.r" is required')).toBeVisible()
        // Test valid file upload with main.r
        const mainR = 'tests/assets/main.r'
        await page.setInputFiles('input[type="file"][name="mainCodeFile"]', mainR)

        const otherCodeR = 'tests/assets/code.r'
        await page.setInputFiles('input[type="file"][name="additionalCodeFiles"]', otherCodeR)

        // // Verify main.r was detected
        // await expect(page.getByText('main.r detected')).toBeVisible()

        // Test file size limit (Commenting out for now, we will likely test this on the fly as to not bog down the repo)
        // const largeFile = 'tests/assets/large-file.zip'
        // await page.setInputFiles('input[type="file"]', largeFile)
        // await expect(page.getByText('File size cannot exceed')).toBeVisible()

        // Click submit and wait for navigation
        await page.getByRole('button', { name: 'Submit', exact: true }).click()

        // Wait until redirected to user dashboard
        await page.waitForURL('**/dashboard', { timeout: 15000 })

        // Wait for the page to fully load
        await page.waitForLoadState('networkidle')

        // Navigate back to the org-specific dashboard where we started
        // This ensures we're checking the same place where the study was created
        await page.goto('/openstax-lab/dashboard')
        await page.waitForLoadState('networkidle')

        // Wait for the table to render - use the "Proposed Studies" title as indicator
        await expect(page.getByRole('heading', { name: 'Proposed Studies' })).toBeVisible({ timeout: 15000 })

        await viewDetails(page, studyFeatures.studyTitle)

        await verifyStudyFileDownloads(page, 'tests/assets/empty.pdf')
    })

    //  disabled until we get the org selector working
    await test.step('reviewer reviews and approves the study', async () => {
        await visitClerkProtectedPage({ page, role: 'reviewer', url: '/openstax/dashboard' })

        // Wait for the dashboard to fully load
        await page.waitForLoadState('networkidle')

        await expect(page.getByText('Review Studies')).toBeVisible()

        await viewDetails(page, studyFeatures.studyTitle)

        // Verify file downloads work before approving
        await verifyStudyFileDownloads(page, 'tests/assets/empty.pdf')

        await page.getByRole('button', { name: /approve/i }).click()
        await page.waitForLoadState('networkidle')

        await page.goto('/openstax/dashboard')

        await viewDetails(page, studyFeatures.studyTitle)

        await expect(page.getByText('Approved on')).toBeVisible()
    })
})
