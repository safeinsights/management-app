import { visitClerkProtectedPage, test, expect } from './e2e.helpers'

// re-use the same worker between the tests inside the describe block
// this ensures they run in order and will share the study title
test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({}, testInfo) => {
    // Extend timeout for all tests running this hook by 30 seconds.
    testInfo.setTimeout(testInfo.timeout + 30_000)
})

test.describe('Studies', () => {
    test('researcher creates a study', async ({ page, studyFeatures }) => {
        await visitClerkProtectedPage({ page, role: 'researcher', url: '/' })

        await expect(page).toHaveTitle(/SafeInsights/)

        await page.getByRole('button', { name: /propose/i }).click()

        await page.getByLabel(/title/i).fill(studyFeatures.studyTitle)
        await page.getByLabel(/investigator/i).fill('Ricky McResearcher')

        await page.setInputFiles('input[type="file"][name="irbDocument"]', 'tests/assets/empty.pdf')
        await page.setInputFiles('input[type="file"][name="descriptionDocument"]', 'tests/assets/empty.pdf')

        // using "exact" to work around possible "NextJS tools"  button in dev mode
        await page.getByRole('button', { name: 'Next', exact: true }).click()

        await expect(page.getByText('Drop files here')).toBeVisible()

        //TODO: Test that will validate the upload without a main.r file
        //Test upload without main.r file
        // const missingMainFile = 'tests/assets/study-no-main.zip'
        // await page.setInputFiles('input[type="file"]', missingMainFile)
        // await expect(page.getByText('A file named "main.r" is required')).toBeVisible()
        // Test valid file upload with main.r
        const mainR = 'tests/assets/main.r'
        await page.setInputFiles('input[type="file"]', mainR)

        // Wait for upload success message
        await expect(page.getByText('All files were uploaded successfully')).toBeVisible()

        // // Verify main.r was detected
        // await expect(page.getByText('main.r detected')).toBeVisible()

        // TODO: Test invalid file type
        // const invalidFileType = 'tests/fixtures/invalid.txt'
        // await page.setInputFiles('input[type="file"]', invalidFileType)
        // await expect(page.getByText('File type must be .zip')).toBeVisible()

        // Test file size limit (Commenting out for now, we will likely test this on the flya as to not bog down the repo)
        // const largeFile = 'tests/assets/large-file.zip'
        // await page.setInputFiles('input[type="file"]', largeFile)
        // await expect(page.getByText('File size cannot exceed')).toBeVisible()

        await page.getByRole('button', { name: 'Next', exact: true }).click()

        await expect(page.getByTestId('study-title')).toHaveValue(studyFeatures.studyTitle)

        await page.getByRole('checkbox', { name: /highlights/i }).check()

        await page.getByRole('button', { name: /submit proposal/i }).click()

        await page.getByRole('button', { name: /all studies/i }).click()
        await page.waitForLoadState('networkidle')

        await expect(page.getByText(studyFeatures.studyTitle).first()).toBeVisible()
    })

    test('member reviews and approves the study', async ({ page, studyFeatures }) => {
        await visitClerkProtectedPage({ page, role: 'member', url: '/' })

        await expect(page.getByText('Review Studies')).toBeVisible()

        const title = studyFeatures.studyTitle.substring(0, 30)

        await page.locator('tr').filter({ hasText: title }).getByText('View').click()

        await page.waitForURL(/\/study\//)
        await expect(page.getByText('Study details')).toBeVisible()

        await page.getByRole('button', { name: /approve/i }).click()
        await page.waitForURL(/\/dashboard\//)

        await page.locator('tr').filter({ hasText: title }).getByText('View').click()
        await expect(page.getByText(/approved on/i)).toBeVisible()
    })
})
