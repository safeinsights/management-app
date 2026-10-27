import { STAGE_TEST_TIMEOUT } from '../config'
import { expect, test } from '../fixtures'
import { labSlug } from '../lifecycle'
import { activeDomain, createInbox, deleteInbox, extractSignupUrl, waitForMessage } from '../mailtm'
import { completeSignup } from '../signup'

// Mailgun, Clerk sign-up, MFA enrollment and the first security key, end to end: an admin invites
// a disposable address, the invitation email arrives, and the account it creates is deleted after.

test(
    'an invited person receives the email and signs up',
    { tag: '@mail' },
    async ({ browser, qaApi, roleContext, target }) => {
        test.setTimeout(STAGE_TEST_TIMEOUT * 2)
        const inbox = await createInbox(await activeDomain())
        let userId = ''
        try {
            const { page } = await roleContext('admin')
            await page.goto(`/${labSlug()}/admin/team`, { waitUntil: 'domcontentloaded' })
            const dialog = page.getByRole('dialog', { name: /invite others to join your team/i })
            await expect(async () => {
                await page.getByRole('button', { name: /invite people/i }).click()
                await expect(dialog).toBeVisible()
            }).toPass()
            await dialog.getByLabel(/email/i).fill(inbox.address)
            await dialog.getByLabel(/^Contributor/).check()
            await dialog.getByRole('button', { name: /send invitation/i }).click()
            await expect(page.getByText(/invitation sent successfully/i)).toBeVisible()

            // Mailgun delivered it, and its link names this environment, not a slot's hostname.
            const message = await waitForMessage(inbox, (candidate) =>
                /account\/invitation\//.test(candidate.text + candidate.html),
            )
            const url = extractSignupUrl(message)
            expect(new URL(url).host).toBe(target.host)

            // Copying the recovery codes and the key needs the clipboard, or each leaves through a confirm.
            const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
            try {
                const signup = await completeSignup(await context.newPage(), url)
                userId = signup.userId
                expect(userId).toBeTruthy()
            } finally {
                await context.close()
            }
        } finally {
            if (userId) {
                const deleted = await qaApi.deleteUser(userId)
                expect([200, 404], await deleted.text()).toContain(deleted.status())
            }
            await deleteInbox(inbox)
        }
    },
)
