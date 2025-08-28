import { expect, test, visitClerkProtectedPage } from './e2e.helpers'

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({}, testInfo) => {
    testInfo.setTimeout(testInfo.timeout + 30_000)
})

test.describe('Resubmit Flow', () => {
    test('researcher creates a study', async ({ page, studyFeatures }) => {
        await visitClerkProtectedPage({ page, role: 'researcher', url: '/researcher/dashboard' })

        await page.waitForTimeout(1000)

        await page.getByTestId('new-study').first().click()

        await page.getByLabel(/title/i).fill(studyFeatures.studyTitle)
        await page.getByLabel(/investigator/i).fill('Ricky McResearcher')

        await page.setInputFiles('input[type="file"][name="irbDocument"]', 'tests/assets/empty.pdf')
        await page.setInputFiles('input[type="file"][name="descriptionDocument"]', 'tests/assets/empty.pdf')
        await page.setInputFiles('input[type="file"][name="agreementDocument"]', 'tests/assets/empty.pdf')

        await page.getByRole('button', { name: 'Next Step' }).click()

        await expect(page.getByText('Upload File')).toBeVisible()

        const mainR = 'tests/assets/main.r'
        await page.setInputFiles('input[type="file"][name="mainCodeFile"]', mainR)

        const otherCodeR = 'tests/assets/code.r'
        await page.setInputFiles('input[type="file"][name="additionalCodeFiles"]', otherCodeR)

        await page.getByRole('button', { name: 'Submit', exact: true }).click()

        await page.waitForLoadState('networkidle')

        await expect(page.getByText(studyFeatures.studyTitle).first()).toBeVisible()
    })

    test('reviewer reviews and rejects the study', async ({ page, studyFeatures }) => {
        await visitClerkProtectedPage({ page, role: 'reviewer', url: '/reviewer/openstax/dashboard' })

        await expect(page.getByText('Review Studies')).toBeVisible()

        const title = studyFeatures.studyTitle.substring(0, 30)

        await page.getByRole('row', { name: title }).getByRole('link', { name: 'View' }).first().click()

        await expect(page.getByRole('heading', { name: 'Study details' })).toBeVisible()

        await page.getByRole('button', { name: /reject/i }).click()

        // Need to confirm rejection modal and add a reason
        await page.getByLabel(/reason for rejection/i).fill('This is a test rejection.')
        await page.getByRole('button', { name: 'Reject Study' }).click()

        await page.waitForLoadState('networkidle')

        await visitClerkProtectedPage({ page, role: 'reviewer', url: '/reviewer/openstax/dashboard' })

        await page.getByRole('row', { name: title }).getByRole('link', { name: 'View' }).click()

        await expect(page.getByText(/rejected on/i)).toBeVisible()
    })

    test('researcher resubmits the study', async ({ page, studyFeatures }) => {
        await visitClerkProtectedPage({ page, role: 'researcher', url: '/researcher/dashboard' })

        const title = studyFeatures.studyTitle
        await page.getByRole('row', { name: title }).getByRole('link', { name: 'View' }).first().click()

        await page.getByRole('button', { name: /resubmit/i }).click()

        const mainR = 'tests/assets/main.r'
        await page.setInputFiles('input[type="file"][name="mainCodeFile"]', mainR)

        const otherCodeR = 'tests/assets/code.r'
        await page.setInputFiles('input[type="file"][name="additionalCodeFiles"]', otherCodeR)

        await page.getByRole('button', { name: 'Resubmit study code' }).click()

        await page.waitForLoadState('networkidle')

        await expect(page.getByText('PENDING-REVIEW')).toBeVisible()
    })

    test('reviewer approves the resubmitted study', async ({ page, studyFeatures }) => {
        await visitClerkProtectedPage({ page, role: 'reviewer', url: '/reviewer/openstax/dashboard' })

        await expect(page.getByText('Review Studies')).toBeVisible()

        const title = studyFeatures.studyTitle.substring(0, 30)

        await page.getByRole('row', { name: title }).getByRole('link', { name: 'View' }).first().click()

        await expect(page.getByRole('heading', { name: 'Study details' })).toBeVisible()

        await page.getByRole('button', { name: /approve/i }).click()
        await page.waitForLoadState('networkidle')

        await visitClerkProtectedPage({ page, role: 'reviewer', url: '/reviewer/openstax/dashboard' })

        await page.getByRole('row', { name: title }).getByRole('link', { name: 'View' }).click()

        await expect(page.getByText(/approved on/i)).toBeVisible()
    })
})
