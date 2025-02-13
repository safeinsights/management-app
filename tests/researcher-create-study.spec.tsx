import { visitClerkProtectedPage, test, expect } from './e2e.helpers'

test.describe('app', () => {
    const testTitle = 'A E2E Test Study'

    test.beforeEach('researcher creates a study', async ({ page }) => {
        await visitClerkProtectedPage({ page, role: 'researcher', url: '/' })

        await expect(page).toHaveTitle(/SafeInsights/)

        await page.getByRole('button', { name: /propose/i }).click()

        await page.getByLabel(/title/i).fill(testTitle)
        await page.getByLabel(/investigator/i).fill('Ricky McResearcher')
        await page.getByLabel(/description/i).fill('this study will cement my legacy as the greatest researcher')
        await page.getByRole('button', { name: /submit/i }).click()

        await expect(page.getByText('containerize and upload')).toBeVisible()
    })

    test('validate file upload', async ({ page }) => {
        //TODO: Test that will validate the upload without a main.r file
        //Test upload without main.r file
        // const missingMainFile = 'tests/assets/study-no-main.zip'
        // await page.setInputFiles('input[type="file"]', missingMainFile)
        // await expect(page.getByText('A file named "main.r" is required')).toBeVisible()

        // Test valid file upload with main.r
        const validStudyZip = 'tests/assets/valid-study.zip'
        await page.setInputFiles('input[type="file"]', validStudyZip)

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
    })

    test.afterEach('researcher creates a study', async ({ page }) => {
        await page.getByRole('button', { name: /next/i }).click()

        await expect(page.getByTestId('study-title')).toHaveValue(testTitle)

        await page.getByRole('checkbox', { name: /highlights/i }).check()

        await page.getByRole('button', { name: /submit proposal/i }).click()

        await page.getByRole('button', { name: /all studies/i }).click()
        await page.waitForLoadState('networkidle')

        await expect(page.getByText(testTitle).first()).toBeVisible()
    })
})
