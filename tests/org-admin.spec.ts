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
        const email = faker.internet.email({ provider: 'test.com' })

        await visitClerkProtectedPage({ page, role: 'admin', url: '/openstax/admin/team' })

        // the admin user should also appear in the list, wait for it to load
        await page.waitForSelector(`text=${TestingUsers.admin.identifier}`, { state: 'visible' })

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

        // verify we landed on the MFA setup screen
        // Check if the code input field is visible
        await expect(page.getByRole('heading', { name: /multi-factor authentication/i })).toBeVisible()

        // Further checks for MFA page elements like link visibility are handled in mfa.spec.ts
    })

    test('org admin can create and edit base image starter code', async ({ page }) => {
        // Navigate as org admin to the settings page for the primary admin org
        await visitClerkProtectedPage({
            page,
            role: 'admin',
            url: '/openstax/admin/settings',
        })

        // Ensure we are on the Settings page and the Base Images section is visible
        await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible()
        await expect(page.getByRole('heading', { name: /base research container images/i })).toBeVisible()

        const baseImageName = `E2E Base Image ${faker.string.alpha(6)}`

        // Open the "Add New Base Image" modal
        const addImageButton = page.getByRole('button', { name: /add image/i })
        await addImageButton.click()
        await expect(page.getByRole('heading', { name: /add new base image/i })).toBeVisible()

        // Fill in base image details
        await page.getByLabel(/name/i).fill(baseImageName)
        await page.getByLabel(/command line/i).fill('Rscript %f')
        await page.getByLabel(/url to base image/i).fill('example.com/e2e-base-image:latest')

        // Choose language (R) - it defaults to R, so we just verify it
        await expect(page.getByRole('textbox', { name: /language/i })).toHaveValue('R')

        // Upload starter code file from tests/assets
        const __filename = fileURLToPath(import.meta.url)
        const __dirname = path.dirname(__filename)
        const starterPath = path.join(__dirname, 'assets', 'starter-code.r')

        const fileInput = page.locator('input[type="file"]').first()
        await fileInput.setInputFiles(starterPath)

        // Save the new base image
        await page.getByRole('button', { name: /save image/i }).click()

        // Wait for the new row to appear in the table
        const row = page.getByRole('row', { name: new RegExp(baseImageName) })
        await expect(row).toBeVisible()
        await expect(row.getByText('starter-code.r')).toBeVisible()

        // Click the Edit action for this row (first button: view starter code, second: edit)
        const actionButtons = row.locator('button')
        await actionButtons.nth(1).click()

        // Edit modal should open
        await expect(page.getByText(/edit base image/i)).toBeVisible()

        // Upload an updated starter code file (reuse the same file path for simplicity)
        const editFileInput = page.locator('input[type="file"]').first()
        await editFileInput.setInputFiles(starterPath)

        // Submit the update
        await page.getByRole('button', { name: /update image/i }).click()

        // Ensure the row is still present and the starter code filename is rendered
        await expect(row).toBeVisible()
        await expect(row.getByText('starter-code.r')).toBeVisible()

        // Optional: open the "View Starter Code" modal to ensure code viewer integrates
        await actionButtons.nth(0).click()
        await expect(page.getByText(/starter code:/i)).toBeVisible()
    })
})
