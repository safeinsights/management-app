import { visitClerkProtectedPage, test, expect } from './e2e.helpers'

test.describe('app', () => {
    test('researcher creates a study', async ({ page }) => {
        await visitClerkProtectedPage({ page, url: '/', role: 'researcher' })

        const testTitle = 'A E2E Test Study'
        await expect(page).toHaveTitle(/SafeInsights/)

        await page.getByRole('button', { name: /propose/i }).click()

        await page.getByLabel(/title/i).fill(testTitle)
        await page.getByLabel(/investigator/i).fill('Ricky McResearcher')
        await page.getByLabel(/description/i).fill('this study will cement my legacy as the greatest researcher')
        await page.getByRole('button', { name: /submit/i }).click()

        await expect(page.getByText('containerize and upload')).toBeVisible()

        await page.getByRole('button', { name: /next/i }).click()

        await expect(page.getByTestId('study-title')).toHaveValue(testTitle)

        await page.getByRole('checkbox', { name: /highlights/i }).check()

        await page.getByRole('button', { name: /submit proposal/i }).click()

        await page.getByRole('button', { name: /all studies/i }).click()
        await page.waitForLoadState('networkidle')

        await expect(page.getByText(testTitle).first()).toBeVisible()
    })

    test('validate file upload', async ({ page }) => {
        await visitClerkProtectedPage({ page, url: '/', role: 'researcher' })

        // Navigate to the upload section
        await page.getByRole('button', { name: /propose/i }).click()
        await page.getByRole('button', { name: /submit/i }).click()
        await page.getByRole('button', { name: /next/i }).click()

        //Verify that study proposal has a highlight checked
        await page.getByRole('checkbox', { name: /highlights/i }).check()

        await page.getByRole('button', { name: /submit proposal/i }).click()

        // Test valid file upload with main.r
        const validStudyZip = 'tests/fixtures/temp/valid-study.zip'
        await page.setInputFiles('input[type="file"]', validStudyZip)
        
        // Wait for upload success message
        await expect(page.getByText('File uploaded successfully')).toBeVisible()
        
        // Verify main.r was detected
        await expect(page.getByText('main.r detected')).toBeVisible()

        // Test upload without main.r file
        const missingMainFile = 'tests/fixtures/study-no-main.zip'
        await page.setInputFiles('input[type="file"]', missingMainFile)
        await expect(page.getByText('A file named "main.r" is required')).toBeVisible()

        // TODO: Test invalid file type
        // const invalidFileType = 'tests/fixtures/invalid.txt'
        // await page.setInputFiles('input[type="file"]', invalidFileType)
        // await expect(page.getByText('File type must be .zip')).toBeVisible()

        // Test file size limit
        const largeFile = 'tests/fixtures/temp/large-file.zip'
        await page.setInputFiles('input[type="file"]', largeFile)
        await expect(page.getByText('File size cannot exceed')).toBeVisible()
    })
})
