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

// ============================================================================
// File verification helpers
// ============================================================================

async function compareFiles(file1Path: string, file2Path: string): Promise<boolean> {
    const file1 = await fs.promises.readFile(file1Path)
    const file2 = await fs.promises.readFile(file2Path)
    return Buffer.compare(file1, file2) === 0
}

async function verifyStudyFileDownloads(page: Page, expectedPdfPath: string) {
    // Test downloading study documents (IRB, Description, Agreement)
    const documentBadges = page.locator('a[href*="/dl/study-documents/"]')

    await documentBadges.first().waitFor({ state: 'visible', timeout: 10000 })

    const documentCount = await documentBadges.count()
    expect(documentCount).toBeGreaterThan(0)

    for (let i = 0; i < documentCount; i++) {
        const href = await documentBadges.nth(i).getAttribute('href')
        expect(href).toBeTruthy()

        const response = await page.request.get(href!)
        expect(response.ok()).toBe(true)

        const tempPath = `/tmp/playwright-download-${Date.now()}-${i}.pdf`
        const buffer = await response.body()
        await fs.promises.writeFile(tempPath, buffer)

        const filesMatch = await compareFiles(tempPath, expectedPdfPath)
        expect(filesMatch).toBe(true)

        await fs.promises.unlink(tempPath)
    }

    // Test downloading code files
    const codeBadges = page.locator('a[href*="/dl/study-code/"]')
    const codeCount = await codeBadges.count()

    if (codeCount > 0) {
        for (let i = 0; i < codeCount; i++) {
            const href = await codeBadges.nth(i).getAttribute('href')
            expect(href).toBeTruthy()

            const filename = href!.split('/').pop()!

            const response = await page.request.get(href!)
            expect(response.ok()).toBe(true)

            const tempPath = `/tmp/playwright-download-${Date.now()}-${filename}`
            const buffer = await response.body()
            await fs.promises.writeFile(tempPath, buffer)

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

            await fs.promises.unlink(tempPath)
        }
    }
}

// ============================================================================
// Step 1: Proposal form helpers
// ============================================================================

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

async function fillProposalAndSelectLanguage(page: Page, studyTitle: string): Promise<string> {
    await visitClerkProtectedPage({ page, role: 'researcher', url: '/openstax-lab/dashboard' })

    await page.getByTestId('new-study').first().click()

    await fillStudyForm(page, { title: studyTitle })

    const nextStepButton = page.getByRole('button', { name: /Save and proceed to code upload/i })
    await expect(nextStepButton).toBeDisabled()

    const radioButton = page.getByRole('radio', { name: 'R', exact: true })
    await radioButton.waitFor({ state: 'visible', timeout: 10000 })
    await radioButton.click()

    await expect(nextStepButton).toBeEnabled()
    await nextStepButton.click()

    await expect(page.getByText('Step 2 of 3')).toBeVisible({ timeout: 15000 })

    return studyTitle
}

// ============================================================================
// Step 2: Code upload helpers
// ============================================================================

async function uploadCodeViaFileUpload(page: Page, mainCodeFile: string) {
    await page.getByRole('button', { name: /Upload your files/i }).click()

    await expect(page.getByRole('dialog')).toBeVisible()

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles([mainCodeFile, 'tests/assets/code.r'])

    const mainFileName = mainCodeFile.split('/').pop()!
    await page.getByRole('radio', { name: mainFileName }).click()

    await page.getByRole('button', { name: 'Done' }).click()

    await expect(page.getByRole('dialog')).not.toBeVisible()

    await expect(page.getByRole('heading', { name: /Review uploaded files/i })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: /Proceed to review/i }).click()

    return mainFileName
}

async function uploadCodeViaIDE(page: Page) {
    const launchButton = page.getByRole('button', { name: /Launch IDE/i })

    const [popup] = await Promise.all([
        page.waitForEvent('popup', { timeout: 5000 }).catch(() => null),
        launchButton.click(),
    ])

    expect(popup).not.toBeNull()

    const importBtn = page.getByRole('button', { name: /Import files from IDE/i }).first()
    await expect(importBtn).toBeVisible({ timeout: 10000 })

    await importBtn.click()
    await expect(page.getByText(/main.r/i)).toBeVisible()

    await page.getByRole('button', { name: /proceed to review/i }).click()

    return 'main.r'
}

// ============================================================================
// Step 3: Review and submit helpers
// ============================================================================

async function verifySummaryPage(page: Page, mainFileName: string) {
    await expect(page.getByRole('heading', { name: /Review your submission/i })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('heading', { name: /Programming Language/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Study Code/i })).toBeVisible()
    await expect(page.getByText(new RegExp(mainFileName, 'i'))).toBeVisible()
}

async function submitStudy(page: Page) {
    await page.getByRole('button', { name: /Submit study/i }).click()
    await page.waitForURL('**/dashboard', { timeout: 15000 })
}

// ============================================================================
// Reviewer helpers
// ============================================================================

async function viewStudyDetails(page: Page, studyTitle: string) {
    const studyRow = page.getByRole('row').filter({ hasText: studyTitle }).filter({ hasNotText: 'DRAFT' })
    await expect(studyRow).toBeVisible({ timeout: 15000 })
    await studyRow.getByRole('link', { name: 'View' }).first().click()
    await expect(
        page.getByRole('heading', { name: /Study Details|Review your submission|Review submission/i }),
    ).toBeVisible()
}

async function reviewerApprovesStudy(page: Page, studyTitle: string) {
    await visitClerkProtectedPage({ page, role: 'reviewer', url: '/openstax/dashboard' })

    await expect(page.getByText('Review Studies')).toBeVisible()

    await viewStudyDetails(page, studyTitle)

    await verifyStudyFileDownloads(page, 'tests/assets/empty.pdf')

    await page.getByRole('button', { name: /approve/i }).click()

    await page.goto('/openstax/dashboard')

    await viewStudyDetails(page, studyTitle)

    await expect(page.getByText('Approved on')).toBeVisible()
}

// ============================================================================
// Tests
// ============================================================================

test('Study creation via file upload', async ({ page, studyFeatures }) => {
    const studyTitle = studyFeatures.studyTitle

    await test.step('researcher fills proposal and selects language', async () => {
        await fillProposalAndSelectLanguage(page, studyTitle)
    })

    await test.step('researcher uploads code files', async () => {
        const mainFileName = await uploadCodeViaFileUpload(page, 'tests/assets/main.r')
        await verifySummaryPage(page, mainFileName)
    })

    await test.step('researcher submits study', async () => {
        await submitStudy(page)
    })

    await test.step('researcher verifies study in dashboard', async () => {
        await page.goto('/openstax-lab/dashboard')
        await viewStudyDetails(page, studyTitle)
        await verifyStudyFileDownloads(page, 'tests/assets/empty.pdf')
    })

    await test.step('reviewer approves study', async () => {
        await reviewerApprovesStudy(page, studyTitle)
    })
})

test('Study creation via IDE', async ({ page, studyFeatures }) => {
    const studyTitle = `${studyFeatures.studyTitle} - IDE`

    await test.step('researcher fills proposal and selects language', async () => {
        await fillProposalAndSelectLanguage(page, studyTitle)
    })

    await test.step('researcher uploads code via IDE', async () => {
        const mainFileName = await uploadCodeViaIDE(page)
        await verifySummaryPage(page, mainFileName)
    })

    await test.step('researcher submits study', async () => {
        await submitStudy(page)
    })

    await test.step('researcher verifies study in dashboard', async () => {
        await page.goto('/openstax-lab/dashboard')
        await viewStudyDetails(page, studyTitle)
    })

    await test.step('reviewer approves study', async () => {
        await reviewerApprovesStudy(page, studyTitle)
    })
})
