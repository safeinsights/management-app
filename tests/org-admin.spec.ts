import { faker } from '@faker-js/faker'
import { expect, test, TestingUsers, visitClerkProtectedPage, goto } from './e2e.helpers'

test.describe('Organization Admin', () => {
    test('can invite users and the invitation can be accepted', async ({ page }) => {
        const email = faker.internet.email({ provider: 'test.com' })

        await visitClerkProtectedPage({ page, role: 'admin', url: '/organization/openstax/admin' })

        // the admin user should also appear in the list, wait for it to load
        await page.waitForSelector(`text=${TestingUsers.admin.identifier}`, { state: 'visible' })

        // create an invite
        await page.getByRole('button', { name: /invite people/i }).click()
        await page.waitForSelector('input[type="email"]', { state: 'visible' })
        await page.getByLabel(/email/i).fill('not an email')
        await page.keyboard.press('Tab')
        await expect(page.getByText('invalid email address')).toBeVisible()

        await page.getByLabel(/email/i).fill(email)
        await page.keyboard.press('Tab')
        await expect(page.getByText('role must be selected')).toBeVisible()

        await page.getByLabel('Reviewer (can review and approve studies)').click()

        await page.getByRole('button', { name: /send/i }).click()
        await expect(page.getByText('sent successfully')).toBeVisible({ timeout: 10000 })

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
        // Check if the code input field is visible
        await expect(page.getByRole('heading', { name: /verification/i })).toBeVisible()

        // Further checks for MFA page elements like link visibility are handled in mfa.spec.ts

        await page.waitForTimeout(1000)

        // test invitation no longer works
        await goto(page, `/account/invitation/${inviteId}`)
        // action waits for 100ms to delete
        await expect(page.getByText(`invalid invitation`)).toBeVisible({ timeout: 200 })
    })
})
