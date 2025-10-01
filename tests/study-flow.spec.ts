import { expect, test, visitClerkProtectedPage } from './e2e.helpers'

// re-use the same worker between the tests inside the describe block
// this ensures they run in order and will share the study title
test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({}, testInfo) => {
    // Extend timeout for all tests running this hook by 30 seconds.
    testInfo.setTimeout(testInfo.timeout + 30_000)
})

test.describe('Studies', () => {
    test.skip('researcher creates a study', async ({ page, studyFeatures }) => {
        await visitClerkProtectedPage({ page, role: 'researcher', url: '/openstax-lab/dashboard' })

        await page.waitForTimeout(1000)

        await page.getByTestId('new-study').first().click()

        await page.getByLabel(/title/i).fill(studyFeatures.studyTitle)
        await page.getByLabel(/investigator/i).fill('Ricky McResearcher')

        // Invalid file testing
        // const invalidFileType = 'tests/assets/invalid.txt'
        // await page.setInputFiles('input[type="file"][name="codeFiles"]', invalidFileType)
        // await expect(page.getByText('File type must be one of .r, .rmd, .R')).toBeVisible()

        await page.setInputFiles('input[type="file"][name="irbDocument"]', 'tests/assets/empty.pdf')
        await page.setInputFiles('input[type="file"][name="descriptionDocument"]', 'tests/assets/empty.pdf')
        await page.setInputFiles('input[type="file"][name="agreementDocument"]', 'tests/assets/empty.pdf')

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

        await expect(page.getByRole('row').filter({ hasText: studyFeatures.studyTitle })).toBeVisible()
    })

    //  disabled until we get the org selector working
    test.skip('reviewer reviews and approves the study', async ({ page, studyFeatures }) => {

        await visitClerkProtectedPage({ page, role: 'reviewer', url: '/openstax-lab/dashboard' })

        await expect(page.getByText('Review Studies')).toBeVisible()

        const title = studyFeatures.studyTitle

        const studyRow = page.getByRole('row').filter({ hasText: title })
        await expect(studyRow).toBeVisible()
        await studyRow.getByRole('link', { name: 'View' }).first().click()

        await expect(page.getByRole('heading', { name: 'Study details' })).toBeVisible()

        let approvalRequestCount = 0
        const studyPageUrl = page.url()
        await page.route(studyPageUrl, (route) => {
            if (route.request().method() === 'POST') approvalRequestCount++
            route.continue()
        })

        await page.getByRole('button', { name: /approve/i }).click()
        await page.waitForLoadState('networkidle')

        expect(approvalRequestCount).toBe(1)

        await page.unroute(studyPageUrl)
        await visitClerkProtectedPage({ page, role: 'reviewer', url: '/reviewer/openstax/dashboard' })

        const viewLink = page.getByRole('row').filter({ hasText: title }).getByRole('link', { name: 'View' })
        await expect(viewLink).toBeVisible()
        await viewLink.click()

        await expect(page.getByText(/approved on/i)).toBeVisible()
    })
})
