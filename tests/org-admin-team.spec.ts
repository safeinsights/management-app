import { authFileFor, expect, goto, reload, test, TestingUsers } from './e2e.helpers'
import { seedInvite, seedOrg, seedThrowawayUser } from './e2e.seed'

// Team management on a freshly seeded Data Partner the reviewer administers. The invite modal and
// re-invite are driven by tests/org-admin.spec.ts.

test.use({ storageState: authFileFor('reviewer') })

test("Org admin changes a member's permission but not their own", { tag: '@admin' }, async ({ page }) => {
    const org = await seedOrg({ type: 'enclave', adminRoles: ['reviewer'] })
    const member = await seedThrowawayUser({ emailPrefix: 'e2e-team-member', orgSlug: org.slug })
    const roleOf = (email: string) => page.getByRole('row').filter({ hasText: email }).getByRole('textbox')

    await goto(page, `/${org.slug}/admin/team`)
    await expect(page.getByRole('heading', { name: 'Manage team', exact: true })).toBeVisible()
    await expect(roleOf(member.email)).toHaveValue('Contributor')
    await roleOf(member.email).click()
    await page.getByRole('option', { name: 'Administrator' }).click()
    await expect(roleOf(member.email)).toHaveValue('Administrator')

    // No toast: the refetch, and then a fresh load, are what show the write.
    await reload(page)
    await expect(roleOf(member.email)).toHaveValue('Administrator')
    // An admin cannot demote themselves by accident.
    await expect(roleOf(TestingUsers.reviewer.identifier)).toBeDisabled()
})

test('Org admin revokes a pending invitation', { tag: '@admin' }, async ({ page }) => {
    const org = await seedOrg({ type: 'enclave', adminRoles: ['reviewer'] })
    const email = `e2e-revoke-${Date.now().toString(36)}@example.com`
    await seedInvite({ orgSlug: org.slug, email })

    await goto(page, `/${org.slug}/admin/team`)
    // The open invitations sit under the invite form, inside the modal.
    await page.getByRole('button', { name: /invite people/i }).click()
    const dialog = page.getByRole('dialog', { name: /invite others to join your team/i })
    const pending = dialog.getByTestId('pending-invites')
    await expect(pending.getByText(email)).toBeVisible()
    await page.getByTestId(`delete-${email}`).click()
    await expect(page.getByText(`The invite for ${email} has been revoked`)).toBeVisible()
    await expect(pending.getByText(email)).toHaveCount(0)
})
