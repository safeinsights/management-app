import { expect, test, visitClerkProtectedPage } from './e2e.helpers'

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

        // Invalid file testing
        // const invalidFileType = 'tests/assets/invalid.txt'
        // await page.setInputFiles('input[type="file"][name="codeFiles"]', invalidFileType)
        // await expect(page.getByText('File type must be one of .r, .rmd, .R')).toBeVisible()

        await page.setInputFiles('input[type="file"][name="irbDocument"]', 'tests/assets/empty.pdf')
        await page.setInputFiles('input[type="file"][name="descriptionDocument"]', 'tests/assets/empty.pdf')
        await page.setInputFiles('input[type="file"][name="agreementDocument"]', 'tests/assets/empty.pdf')

        await expect(page.getByText('Drop your files or browse')).toBeVisible()

        //TODO: Test that will validate the upload without a main.r file
        //Test upload without main.r file
        // const missingMainFile = 'tests/assets/study-no-main.zip'
        // await page.setInputFiles('input[type="file"]', missingMainFile)
        // await expect(page.getByText('A file named "main.r" is required')).toBeVisible()
        // Test valid file upload with main.r
        const mainR = 'tests/assets/main.r'
        await page.setInputFiles('input[type="file"][name="codeFiles"]', mainR)

        // // Verify main.r was detected
        // await expect(page.getByText('main.r detected')).toBeVisible()

        // Test file size limit (Commenting out for now, we will likely test this on the fly as to not bog down the repo)
        // const largeFile = 'tests/assets/large-file.zip'
        // await page.setInputFiles('input[type="file"]', largeFile)
        // await expect(page.getByText('File size cannot exceed')).toBeVisible()
        await page.getByRole('button', { name: 'Submit', exact: true }).click()

        // TODO Final step changed? these aren't in the mockups :thinking:
        // await expect(page.getByTestId('study-title')).toHaveValue(studyFeatures.studyTitle)
        //
        // await page.getByRole('checkbox', { name: /highlights/i }).check()
        //
        // await page.getByRole('button', { name: /submit proposal/i }).click()
        //
        // await page.getByRole('button', { name: /all studies/i }).click()
        await page.waitForLoadState('networkidle')

        await expect(page.getByText(studyFeatures.studyTitle).first()).toBeVisible()
    })

    test('member reviews and approves the study', async ({ page, studyFeatures }) => {
        await visitClerkProtectedPage({ page, role: 'member', url: '/' })
        await page.getByText(/dashboard/i).click()

        await expect(page.getByText('Review Studies')).toBeVisible()

        const title = studyFeatures.studyTitle.substring(0, 30)

        await page.getByRole('row', { name: title }).getByRole('link', { name: 'View' }).click()

        await page.waitForURL(/\/study\//)
        await expect(page.getByRole('heading', { name: 'Study details' })).toBeVisible()

        await page.getByRole('button', { name: /approve/i }).click()
        await page.waitForURL(/\/dashboard/)

        await page.getByRole('row', { name: title }).getByRole('link', { name: 'View' }).click()

        await expect(page.getByText(/approved on/i)).toBeVisible()
    })
})
