import { faker } from '@faker-js/faker'
import { expect, test, TestingUsers, visitClerkProtectedPage, goto } from './e2e.helpers'

test.beforeEach(async ({}, testInfo) => {
    // Extend timeout for all tests running this hook by 30 seconds.
    testInfo.setTimeout(testInfo.timeout + 30_000)
})

test.describe('Organization Admin', () => {
    test('can invite users and the invitation can be accepted', async ({ page }) => {
        const email = faker.internet.email({ provider: 'test.com' })

        await visitClerkProtectedPage({ page, role: 'admin', url: '/admin/team/openstax' })

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

        // ── close the modal so the rest of the page (incl. profile menu) is accessible ──
        await page.keyboard.press('Escape')                 // Mantine modal closes on ESC
        await page.waitForSelector('[role="dialog"]', {     // ensure it is gone
            state: 'detached',
        })

        // test invite
        await goto(page, `/account/invitation/${inviteId}`)
        await expect(
            page.getByText('This invitation is for a different user. Please log out and try again.').first(),
        ).toBeVisible()

        // The user is still logged in, so sign out to continue the test as a new user.
        await page.getByRole('button', { name: 'Toggle profile menu' }).click()
        await page.getByRole('menuitem', { name: 'Sign Out' }).click()
        await page.waitForURL('**/signin**')

        // Now, as a logged-out user, accept the invitation
        await goto(page, `/account/invitation/${inviteId}`)

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
        await expect(page.getByText(`Invalid or already claimed invitation.`)).toBeVisible()
    })
})
