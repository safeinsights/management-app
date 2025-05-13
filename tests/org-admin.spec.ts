import { faker } from '@faker-js/faker'
import { clerk, expect, test, visitClerkProtectedPage } from './e2e.helpers'

test.describe('Organization Admin', () => {
    test('can invite users and the invitation can be accepted', async ({ page }) => {
        const email = faker.internet.email()

        await visitClerkProtectedPage({ page, role: 'admin', url: '/organization/openstax/admin' })

        // create an invite
        await page.getByRole('button', { name: /invite people/i }).click()
        await page.getByLabel(/email/i).fill('not an email')
        await page.keyboard.press('Tab')
        await expect(page.getByText('invalid email address')).toBeVisible()

        await page.getByLabel(/email/i).fill(email)
        await page.keyboard.press('Tab')
        await expect(page.getByText('role must be selected')).toBeVisible()
        await page.getByLabel(/review and approve studies/i).click()
        await page.getByRole('button', { name: /send/i }).click()
        await expect(page.getByText(`sent successfully`)).toBeVisible()

        await page.getByRole('button', { name: /continue to invite people/i }).click()

        const pendingPanel = page.getByTestId('pending-invites')
        await expect(pendingPanel.getByText(email)).toBeVisible()

        const btn = page.getByTestId(`re-invite-${email}`)
        const inviteId = await btn.getAttribute('data-pendig-id')
        await btn.click()

        await expect(page.getByText(`${email} has been re-invited`)).toBeVisible()

        // test invite
        await page.goto(`/account/invitation/${inviteId}`)
        await expect(page.getByText(`must be signed out`)).toBeVisible()
        await page.getByRole('button', { name: /signout/i }).click()

        await page.getByRole('button', { name: /create account/i }).click()
        await expect(page.getByText('cannot be left blank')).toHaveCount(2)

        await expect(page.getByText('must be at least 8 characters')).toBeVisible()

        await page.getByLabel(/first name/i).fill(faker.person.firstName())
        await page.getByLabel(/last name/i).fill(faker.person.lastName())
        await page.getByLabel(/password/i).fill(faker.internet.password())

        await page.getByRole('button', { name: /create account/i }).click()

        await expect(page.getByText(/account has been created/i)).toBeVisible()

        // test nav to mfa page
        await page.getByRole('button', { name: /secure your account/i }).click()

        // verify we landed on the MFA setup screen
        await expect(page).toHaveURL(/\/account\/mfa$/)
        // check both setup options are present
        await expect(page.getByRole('link', { name: 'SMS Verification' })).toBeVisible()
        await expect(page.getByRole('link', { name: 'Authenticator App Verification' })).toBeVisible()

        // test invitation no longer works
        await page.goto(`/account/invitation/${inviteId}`)
        // action waits for 100ms to delete
        await expect(page.getByText(`invalid invitation`)).toBeVisible({ timeout: 200 })
    })
})
