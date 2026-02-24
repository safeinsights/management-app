import { faker } from '@faker-js/faker'
import { expect, goto, test, TestingUsers, visitClerkProtectedPage, path } from './e2e.helpers'
import { fileURLToPath } from 'url'

// must use object, see https://playwright.dev/docs/test-fixtures and https://playwright.dev/docs/test-parameterize
// eslint-disable-next-line no-empty-pattern
test.beforeEach(async ({}, testInfo) => {
    // Extend timeout for all tests running this hook by 30 seconds.
    testInfo.setTimeout(testInfo.timeout + 30_000)
})

test.describe('Organization Admin', () => {
    test('can invite users and the invitation can be accepted', async ({ page }) => {
        const uniqueSuffix = Date.now().toString(36)
        const email = `test-invite-${uniqueSuffix}@test.com`

        await visitClerkProtectedPage({ page, role: 'reviewer', url: '/reviewer-is-org-admin/admin/team' })

        // the admin user should also appear in the list, wait for it to load
        await page.waitForSelector(`text=${TestingUsers.reviewer.identifier}`, { state: 'visible' })

        // create an invite
        const inviteBtn = page.getByRole('button', { name: /invite people/i })
        await inviteBtn.waitFor({ state: 'visible' })
        await inviteBtn.click({ force: true })
        await page.waitForSelector('input[type="email"]', { state: 'visible' })
        await page.getByLabel(/email/i).fill('not an email')
        await page.keyboard.press('Tab')
        await expect(page.getByText(/invalid email address/i)).toBeVisible()

        await page.getByLabel(/email/i).fill(email)
        await page.keyboard.press('Tab')

        await expect(page.getByText(/a permission must be selected/i)).toBeVisible()

        await page.getByLabel('Administrator (manages org-level settings and contributors)').click()

        await page.getByRole('button', { name: /send invitation/i }).click()
        await expect(page.getByText(/invitation sent successfully/i)).toBeVisible()

        await page.getByRole('button', { name: /continue to invite people/i }).click()

        const pendingPanel = page.getByTestId('pending-invites')
        await expect(pendingPanel.getByText(email)).toBeVisible()

        const btn = page.getByTestId(`re-invite-${email}`)
        const inviteId = await btn.getAttribute('data-pending-id')
        await btn.click()

        await expect(page.getByText(`${email} has been re-invited`)).toBeVisible()

        // test invite
        await goto(page, `/account/invitation/${inviteId}`)
        await page.waitForTimeout(1000)
        await expect(page.getByText(`must be signed out`)).toBeVisible()
        await page.getByRole('button', { name: /signout/i }).click()
        await page.waitForTimeout(1000)

        // Ensure the Create Account link is initially visible
        const createAccountBtn = page.getByRole('link', { name: /create new account/i })
        await expect(createAccountBtn).toBeVisible()
        await createAccountBtn.click()
        await page.waitForURL(`/account/invitation/${inviteId}/signup`)

        // Fill in the required form fields
        await page.getByLabel(/first name/i).fill(faker.person.firstName())
        await page.getByLabel(/last name/i).fill(faker.person.lastName())

        // Create a valid password that meets all requirements (8+ chars, number, uppercase, special)
        const validPassword = 'TestPass1*'
        await page.getByLabel(/^enter password$/i).fill(validPassword)
        await page.getByLabel(/confirm password/i).fill(validPassword)

        const submitBtn = page.getByRole('button', { name: /create account/i })
        // Wait for the button to become enabled
        await expect(submitBtn).toBeEnabled()
        // Submit the form
        await submitBtn.click()

        await expect(page.getByRole('heading', { name: /multi-factor authentication/i })).toBeVisible({
            timeout: 15000,
        })
    })

    test('org admin can create and edit code environment starter code', async ({ page }) => {
        await visitClerkProtectedPage({
            page,
            role: 'reviewer',
            url: '/reviewer-is-org-admin/admin/settings',
        })

        await expect(page).toHaveURL(/\/reviewer-is-org-admin\/admin\/settings/, { timeout: 10000 })

        await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible({ timeout: 10000 })
        await expect(page.getByRole('heading', { name: /code environments/i })).toBeVisible()

        const codeEnvName = `E2E Code Env ${faker.string.alpha(6)}`

        // Open the "Add Code Environment" modal
        const addButton = page.getByRole('button', { name: /add code environment/i })
        await addButton.click()
        await expect(page.getByRole('heading', { name: /add code environment/i })).toBeVisible()

        // Fill in code environment details
        await page.getByLabel(/name/i).fill(codeEnvName)
        await page.getByLabel(/command line/i).fill('Rscript %f')
        await page.getByLabel(/url to code environment/i).fill('example.com/e2e-code-env:latest')

        // Choose language (R) - it defaults to R, so we just verify it
        await expect(page.getByRole('textbox', { name: /language/i })).toHaveValue('R')

        // Upload starter code file from tests/assets
        const __filename = fileURLToPath(import.meta.url)
        const __dirname = path.dirname(__filename)
        const starterPath = path.join(__dirname, 'assets', 'main.r')

        const fileInput = page.locator('input[type="file"]').first()
        await fileInput.setInputFiles(starterPath)

        // Save the new code environment
        await page.getByRole('button', { name: /save code environment/i }).click()

        await expect(page.getByRole('dialog', { name: /add code environment/i })).toBeHidden({ timeout: 10000 })

        // Wait for the new code environment to appear
        await expect(page.getByText(codeEnvName)).toBeVisible()

        // Find the code environment row and click its Edit button
        const codeEnvRow = page.getByText(codeEnvName, { exact: true }).locator('xpath=../../..')
        await codeEnvRow.locator('button').nth(1).click()

        // Edit modal should open
        const editDialog = page.getByRole('dialog', { name: /edit code environment/i })
        await expect(editDialog).toBeVisible()

        // Edit a text field to verify the update flow works
        const updatedName = `${codeEnvName} Updated`
        await editDialog.getByLabel(/name/i).fill(updatedName)

        // Submit the update
        await editDialog.getByRole('button', { name: /update code environment/i }).click()

        await expect(editDialog).toBeHidden({ timeout: 10000 })

        // Ensure the updated code environment name is present
        await expect(page.getByText(updatedName)).toBeVisible()

        // Expand the detail panel by clicking the caret toggle
        const updatedRow = page.getByText(updatedName, { exact: true }).locator('xpath=../../..')
        await updatedRow.getByRole('button').first().click()

        // Click the "View Starter Code" icon button within this row's detail panel
        await updatedRow.getByLabel(/view starter code/i).click()

        // Verify the code viewer modal opens with the file content
        const codeViewerDialog = page.getByRole('dialog', { name: /starter code/i })
        await expect(codeViewerDialog).toBeVisible({ timeout: 10000 })
        await expect(codeViewerDialog.locator('code')).toContainText('initialize_container')
    })
})
