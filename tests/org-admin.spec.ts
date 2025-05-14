import { faker } from '@faker-js/faker'
import { expect, test, visitClerkProtectedPage } from './e2e.helpers'

test.describe('Organization Admin', () => {
    test('can invite users and the invitation can be accepted', async ({ page }) => {
        const email = faker.internet.email()

        await visitClerkProtectedPage({ page, role: 'admin', url: '/organization/openstax/admin' })

        // create an invite
        await page.getByRole('button', { name: /invite people/i }).click()

        try {
            await page.waitForSelector('input[type="email"]', { timeout: 5000, state: 'visible' })
        } catch (e) {
            console.error('[TEST LOG] Timeout waiting for email input to be visible:', e)
            throw e
        }

        await page.getByLabel(/email/i).fill('not an email')
        await page.keyboard.press('Tab')
        await expect(page.getByText('invalid email address')).toBeVisible()

        await page.getByLabel(/email/i).fill(email)
        await page.keyboard.press('Tab')
        await expect(page.getByText('role must be selected')).toBeVisible()
        await page.getByLabel(/review and approve studies/i).click()
        await page.getByRole('button', { name: /send/i }).click()

        await expect(page.getByText('sent successfully')).toBeVisible({ timeout: 10000 })

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
        // Further checks for MFA page elements like link visibility are handled in mfa.spec.ts

        // test invitation no longer works
        await page.goto(`/account/invitation/${inviteId}`)
        // action waits for 100ms to delete
        await expect(page.getByText(`invalid invitation`)).toBeVisible({ timeout: 200 })
    })
})
