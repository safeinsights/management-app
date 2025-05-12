import { faker } from '@faker-js/faker'
import { clerk, expect, test, visitClerkProtectedPage } from './e2e.helpers'

test.describe('Organization Admin', () => {
    test('can invite users and the invitation can be accepted', async ({ page }) => {
        const email = faker.internet.email()

        await visitClerkProtectedPage({ page, role: 'admin', url: '/organization/openstax/admin' })

        // create an invite
        await page.getByRole('button', { name: /invite people/i }).click()

        // Wait for the modal to appear using its title and get a locator for it
        const inviteModal = page.getByRole('dialog', { name: /invite others to join your team/i })
        await expect(inviteModal).toBeVisible()

        // Interact with elements within the modal
        await inviteModal.getByLabel(/invite by email/i).fill('not an email')
        await inviteModal.getByLabel(/invite by email/i).press('Tab')
        await expect(inviteModal.getByText('invalid email address')).toBeVisible()

        await inviteModal.getByLabel(/invite by email/i).fill(email)
        await inviteModal.getByLabel(/invite by email/i).press('Tab')
        await expect(inviteModal.getByText('Role must be selected')).toBeVisible()

        await inviteModal.getByLabel(/reviewer \(can review and approve studies\)/i).check()

        await inviteModal.getByRole('button', { name: /send invitation/i }).click()
        await expect(inviteModal.getByRole('heading', { name: /invitation sent successfully!/i })).toBeVisible()

        await inviteModal.getByRole('button', { name: /continue to invite people/i }).click()
        await inviteModal.press('Escape')
        await expect(inviteModal).not.toBeVisible()

        const pendingPanel = page.getByTestId('pending-invites')
        await expect(pendingPanel.getByText(email)).toBeVisible()

        const btn = page.getByTestId(`re-invite-${email}`)
        const inviteId = await btn.getAttribute('data-pending-id')
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
        await expect(page.getByText('Two-Step Verification')).toBeVisible()

        // test invitation no longer works
        await page.goto(`/account/invitation/${inviteId}`)
        // action waits for 100ms to delete
        await expect(page.getByText(`invalid invitation`)).toBeVisible({ timeout: 200 })
    })
})
