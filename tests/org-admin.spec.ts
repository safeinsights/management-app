import { faker } from '@faker-js/faker'
import { authFileFor, expect, goto, test, TestingUsers, visitAsRole, path } from './e2e.helpers'
import { fileURLToPath } from 'url'

// Reviewer is the org admin for `reviewer-is-org-admin`; restore its saved session
// so the admin screens load without an inline sign-in. The invite-accept test signs
// out partway through (that sign-out + signup is the surface it covers).
test.use({ storageState: authFileFor('reviewer') })

test.describe('Organization Admin', () => {
    test('can invite users and the invitation can be accepted', async ({ page }) => {
        const uniqueSuffix = Date.now().toString(36)
        const email = `test-invite-${uniqueSuffix}@test.com`

        await visitAsRole(page, '/reviewer-is-org-admin/admin/team')

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
        // The signed-out gate copy is the deterministic signal the page resolved.
        await expect(page.getByText('You must be signed out to accept invitations', { exact: true })).toBeVisible()
        await page.getByRole('button', { name: /sign out/i }).click()

        // After sign-out the page re-renders the accept-invitation entry with the
        // Create Account link; waiting on it replaces a fixed sleep.
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

        await page.getByRole('checkbox', { name: /terms of service/i }).check()

        const submitBtn = page.getByRole('button', { name: /create account/i })
        // Wait for the button to become enabled
        await expect(submitBtn).toBeEnabled()
        // Submit the form
        await submitBtn.click()

        // The CI Clerk instance enforces a second factor at first sign-in, so the freshly-created
        // account's sign-in returns `needs_second_factor` rather than completing. The signup page
        // surfaces an actionable error for that case instead of stranding the user (see PR #742).
        await expect(page.getByText(/multi-factor authentication is required before you can sign in/i)).toBeVisible()
    })

    test('org admin can create and edit code environment starter code', async ({ page }) => {
        await visitAsRole(page, '/reviewer-is-org-admin/admin/settings')

        await expect(page).toHaveURL(/\/reviewer-is-org-admin\/admin\/settings/)

        await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible()
        await expect(page.getByRole('heading', { name: /code environments/i })).toBeVisible()

        const codeEnvName = `E2E Code Env ${faker.string.alpha(6)}`
        const codeEnvIdentifier = `e2e_${faker.string.alpha(6).toLowerCase()}`

        // Open the "Add Code Environment" modal. A React Query refetch of the org's
        // code-env list (the settings page re-renders as its data lands) can detach the
        // button mid-click, so retry the click until the modal actually opens.
        const addButton = page.getByRole('button', { name: /add code environment/i })
        const addHeading = page.getByRole('heading', { name: /add code environment/i })
        await expect(async () => {
            await addButton.click()
            await expect(addHeading).toBeVisible()
        }).toPass()

        // Fill in code environment details
        await page.getByLabel(/identifier/i).fill(codeEnvIdentifier)
        await page.getByRole('textbox', { name: /^name$/i }).fill(codeEnvName)
        await page.getByPlaceholder(/extension/i).fill('r')
        await page.getByPlaceholder(/command.*%f/i).fill('Rscript %f')
        await page.getByLabel(/add command line/i).click()
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

        await expect(page.getByRole('dialog', { name: /add code environment/i })).toBeHidden()

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
        await editDialog.getByRole('textbox', { name: /^name$/i }).fill(updatedName)

        // Submit the update
        await editDialog.getByRole('button', { name: /update code environment/i }).click()

        await expect(editDialog).toBeHidden()

        // Ensure the updated code environment name is present
        await expect(page.getByText(updatedName)).toBeVisible()

        // Expand the detail panel by clicking the caret toggle
        const updatedRow = page.getByText(updatedName, { exact: true }).locator('xpath=../../..')
        await updatedRow.getByRole('button').first().click()

        // Click the "View" icon button for the starter code file
        await updatedRow.getByLabel(/view main\.r/i).click()

        // Verify the code viewer modal opens with the file content
        const codeViewerDialog = page.getByRole('dialog', { name: /starter code/i })
        await expect(codeViewerDialog).toBeVisible()
        await expect(codeViewerDialog.locator('code')).toContainText('initialize()')
    })
})
