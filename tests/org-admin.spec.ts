import { faker } from '@faker-js/faker'
import { expect, test, visitClerkProtectedPage } from './e2e.helpers'

test.describe('Organization Admin', () => {
    test('can invite users', async ({ page }) => {

        await visitClerkProtectedPage({ page, role: 'admin', url: '/organization/openstax/admin' })

        await page.getByRole('button', { name: /invite people/i }).click()


        await page.getByLabel(/email/i).fill('not an email')

        await page.getByRole('button', { name: /send/i }).click()

        await expect(page.getByText('invalid email address')).toBeVisible()

        const email = faker.internet.email()
        await page.getByLabel(/email/i).fill(email)

        await page.getByRole('button', { name: /send/i }).click()


        await expect(page.getByText('role must be selected')).toBeVisible()

        await page.getByLabel(/review and approve studies/i).click()

        await page.getByRole('button', { name: /send/i }).click()
        await expect(page.getByText(`${email} has been invited`)).toBeVisible()

        const pendingPanel = page.getByTestId('pending-panel')
        await expect(pendingPanel.getByText(email)).toBeVisible()

        await page.getByTestId(`re-invite-${email}`).click()
        await expect(page.getByText(`${email} has been reinvited`)).toBeVisible()
    })
})
