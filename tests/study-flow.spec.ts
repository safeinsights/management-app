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
        await visitClerkProtectedPage({ page, role: 'researcher', url: '/researcher/dashboard' })

        await page.waitForTimeout(1000)

        await page.getByTestId('new-study').first().click()

        await page.getByLabel(/title/i).fill(studyFeatures.studyTitle)
        await page.getByLabel(/investigator/i).fill('Ricky McResearcher')

        // Upload required documents
        await page.setInputFiles('input[type="file"][name="irbDocument"]', 'tests/assets/empty.pdf')
        await page.setInputFiles('input[type="file"][name="descriptionDocument"]', 'tests/assets/empty.pdf')
        await page.setInputFiles('input[type="file"][name="agreementDocument"]', 'tests/assets/empty.pdf')

        await expect(page.getByText('Upload File')).toBeVisible()

        // Test valid file upload with main.r
        const mainR = 'tests/assets/main.r'
        await page.setInputFiles('input[type="file"][name="codeFiles"]', mainR)

    await page.getByRole('button', { name: 'Submit proposal', exact: true }).click()
        await expect(page.getByText('Confirm proposal submission')).toBeVisible()

        await page.getByRole('button', { name: 'No, continue editing', exact: true }).click()
        await expect(page.getByText('Confirm proposal submission')).not.toBeVisible()

        await page.getByRole('button', { name: 'Submit proposal', exact: true }).click()
        await page.getByRole('button', { name: 'Yes, submit proposal', exact: true }).click()

        await page.waitForLoadState('networkidle')

        await expect(page.getByText(studyFeatures.studyTitle).first()).toBeVisible()
    })

    test('reviewer reviews and approves the study', async ({ page, studyFeatures }) => {
        await visitClerkProtectedPage({ page, role: 'reviewer', url: '/reviewer/openstax/dashboard' })

        await expect(page.getByText('Review Studies')).toBeVisible()

        const title = studyFeatures.studyTitle.substring(0, 30)

        await page.getByRole('row', { name: title }).getByRole('link', { name: 'View' }).first().click()

        await expect(page.getByRole('heading', { name: 'Study details' })).toBeVisible()

        await page.getByRole('button', { name: /approve/i }).click()

        await page.getByRole('row', { name: title }).getByRole('link', { name: 'View' }).click()

        await expect(page.getByText(/approved on/i)).toBeVisible()
    })
})
