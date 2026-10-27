import { authFileFor, expect, fillPinInput, goto, test, TestingUsers } from './e2e.helpers'
import { seedInvite, seedOrg } from './e2e.seed'

// The three ways an existing account meets an invitation. Every invite targets a freshly seeded Data
// Partner, so joining it changes no fixture org another worker reads. The new-account signup path is
// driven by tests/org-admin.spec.ts.

test.use({ storageState: authFileFor('reviewer') })

test('An existing user accepts an invitation and lands on the new dashboard', async ({ page }) => {
    const org = await seedOrg({ type: 'enclave' })
    const { inviteId } = await seedInvite({ orgSlug: org.slug, email: TestingUsers.reviewer.identifier })

    // The emailed link: the signed-in account it names goes straight to the join step.
    await goto(page, `/account/invitation/${inviteId}`)
    await page.waitForURL(`/account/invitation/${inviteId}/join-team`)
    await expect(page.getByRole('heading', { name: `You’ve been invited to join ${org.name}.` })).toBeVisible()
    await expect(page.getByText(/as a contributor/)).toBeVisible()

    await page.getByRole('button', { name: 'Accept invitation' }).click()
    await page.waitForURL(`/${org.slug}/dashboard`)
    await expect(page.getByTestId('joined-org-banner')).toContainText(`You have been added to ${org.name}.`)
    // Joined for good: the org is in the side nav.
    await expect(page.getByRole('link', { name: new RegExp(org.name) })).toBeVisible()
})

test('An existing user declines an invitation', async ({ page }) => {
    const org = await seedOrg({ type: 'enclave' })
    const { inviteId } = await seedInvite({ orgSlug: org.slug, email: TestingUsers.reviewer.identifier })

    await goto(page, `/account/invitation/${inviteId}/join-team`)
    await expect(page.getByRole('heading', { name: `You’ve been invited to join ${org.name}.` })).toBeVisible()
    await page.getByRole('button', { name: 'Decline invitation' }).click()
    const dialog = page.getByRole('dialog', { name: 'Decline invitation?' })
    await expect(dialog).toContainText(org.name)
    await dialog.getByRole('button', { name: 'Decline invitation' }).click()

    await page.waitForURL('/dashboard')
    await expect(page.getByText(/declined .*invitation\./)).toBeVisible()
    // Declined, the link is dead.
    await goto(page, `/account/invitation/${inviteId}`)
    await expect(page.getByRole('heading', { name: 'This invitation is no longer valid' })).toBeVisible()
})

test('A claimed invitation links its email to the account', async ({ page }) => {
    const org = await seedOrg({ type: 'enclave' })
    const linkedEmail = `linked-${Date.now().toString(36)}@example.com`
    const { inviteId } = await seedInvite({ orgSlug: org.slug, email: linkedEmail })

    // The join step takes the invite as its credential; an address that differs from the account's
    // is then offered for linking, with a code sent to it.
    await goto(page, `/account/invitation/${inviteId}/join-team`)
    await page.getByRole('button', { name: 'Accept invitation' }).click()
    await page.waitForURL(`/account/invitation/${inviteId}/link-email`)
    await expect(page.getByRole('heading', { name: 'Link your email addresses' })).toBeVisible()
    await expect(page.getByText(`${linkedEmail} was invited to ${org.name}`)).toBeVisible()

    await fillPinInput(page, '424242', 'link-email-pin-input')
    await page.getByRole('button', { name: 'Verify and link' }).click()
    await page.waitForURL(`/${org.slug}/dashboard`)
    await expect(page.getByTestId('joined-org-banner')).toContainText(
        `You have been added to ${org.name} and ${linkedEmail} is now linked to your account.`,
    )
})
