import { expect, type Page } from '@playwright/test'
import { signedInMarker } from './auth'
import { totp } from './totp'

// A new account from an invitation, through the real Clerk sign-up, the mandatory authenticator
// enrollment (the page shows the secret, so the codes are computed here), the recovery codes and
// the first security key. Ported from qa-review/src/engine/flows/signup.ts, with the app's copy.

export const SIGNUP_PASSWORD = 'E2e-Signup-Test-9a!'
const TOTP_PERIOD_MS = 30_000
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// The authenticator page shows the secret as text (src/app/account/mfa/app/add-app-mfa.tsx): a
// base32 string of a whole number of 8-character blocks, which nothing else on the page is.
export async function readTotpSecret(page: Page): Promise<string> {
    let secret = ''
    await expect(async () => {
        const texts = await page.evaluate(() =>
            Array.from(document.querySelectorAll('p, span, code, input')).map((element) =>
                element instanceof HTMLInputElement ? element.value : (element.textContent ?? ''),
            ),
        )
        for (const text of texts) {
            for (const match of text.toUpperCase().matchAll(/\b[A-Z2-7]{16,}\b/g)) {
                if (match[0].length % 8 === 0 && match[0].length > secret.length) secret = match[0]
            }
        }
        expect(secret, 'the authenticator setup page shows its secret').not.toBe('')
    }).toPass()
    return secret
}

// Clerk refuses a code it has already accepted, so a retry waits for the next 30-second window.
async function waitForNextTotpWindow() {
    await sleep(TOTP_PERIOD_MS - (Date.now() % TOTP_PERIOD_MS) + 500)
}

// The app's OtpInput labels its six digits "Digit n of 6".
async function fillOtp(page: Page, code: string) {
    for (let i = 0; i < code.length; i++) {
        await page.getByLabel(`Digit ${i + 1} of 6`, { exact: true }).fill(code[i])
    }
}

// Enrolls the authenticator with a freshly computed code; returns the secret that verified.
export async function enterTotp(page: Page): Promise<string> {
    const enrolled = page.getByRole('heading', { name: 'Multi-factor authentication is set up successfully!' })
    const rejected = page.getByText(/incorrect|invalid|try again/i)
    for (let attempt = 0; attempt < 4; attempt++) {
        const secret = await readTotpSecret(page)
        await fillOtp(page, totp(secret))
        await page.getByRole('button', { name: 'Verify code' }).click()
        await expect(enrolled.or(rejected).first()).toBeVisible()
        if (await enrolled.isVisible()) return secret
        await waitForNextTotpWindow()
    }
    throw new Error('authenticator MFA: the code was rejected on every attempt')
}

// Clerk may ask for a second code before it hands out the recovery codes; it will not accept the
// one that just enrolled, so this waits for the next window.
async function answerStepUpIfAsked(page: Page, secret: string) {
    const dialog = page.getByRole('dialog').filter({ hasText: /verification required/i })
    if (!(await dialog.isVisible())) return
    await waitForNextTotpWindow()
    await dialog.getByRole('textbox').first().fill(totp(secret))
    await expect(dialog).toBeHidden()
}

export async function completeSignup(
    page: Page,
    invitationUrl: string,
): Promise<{ userId: string; totpSecret: string }> {
    await page.context().clearCookies()
    await page.goto(invitationUrl, { waitUntil: 'domcontentloaded' })
    await page.getByRole('link', { name: 'Create New Account' }).click()

    await page.getByLabel('First name').fill('E2E')
    await page.getByLabel('Last name').fill('Signup')
    await page.getByLabel('Enter password').fill(SIGNUP_PASSWORD)
    await page.getByLabel('Confirm password').fill(SIGNUP_PASSWORD)
    // The ToS/PN box, plus a participation agreement box when the org has published one.
    const createAccount = page.getByRole('button', { name: 'Create account' })
    await expect(async () => {
        for (const box of await page.getByRole('checkbox', { name: /i agree/i }).all()) {
            if (!(await box.isChecked())) await box.check()
        }
        await expect(createAccount).toBeEnabled()
    }).toPass()
    await createAccount.click()

    // Sign-up lands on the MFA options page; a new account must enroll before anything else.
    await page.getByRole('link', { name: 'Authenticator app verification' }).click()
    await expect(page.getByRole('button', { name: 'Verify code' })).toBeVisible()
    const totpSecret = await enterTotp(page)
    await answerStepUpIfAsked(page, totpSecret)

    // Leaving without copying the codes opens a "have you stored them?" confirm with a button of
    // the same name.
    await page
        .getByRole('button', { name: 'Copy codes' })
        .click()
        .catch(() => {})
    await page.getByRole('button', { name: 'Go to SafeInsights' }).first().click()
    const recovery = page.getByRole('dialog', { name: 'Have you stored your MFA recovery codes?' })
    if (await recovery.isVisible()) await recovery.getByRole('button', { name: 'Go to SafeInsights' }).click()

    // A keyless account is bounced here from wherever it lands; the page is the same either way.
    await page.goto('/account/keys', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Security key' })).toBeVisible()
    await page.getByRole('button', { name: 'Copy key' }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    await page
        .getByRole('dialog', { name: 'Have you stored your security key?' })
        .getByRole('button', { name: 'Yes, I have stored my key' })
        .click()
    await expect(signedInMarker(page)).toBeVisible()

    // The QA routes delete by the app's own user id, which Clerk carries in its metadata.
    let userId = ''
    await expect(async () => {
        userId = await page.evaluate(() => {
            const clerk = (window as unknown as { Clerk?: { user?: { publicMetadata?: { user?: { id?: string } } } } })
                .Clerk
            return clerk?.user?.publicMetadata?.user?.id ?? ''
        })
        expect(userId).not.toBe('')
    }).toPass()

    // Reaching a dashboard does not prove the key took; the key page is the discriminator.
    await page.goto('/user-key', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Existing security key', level: 2 })).toBeVisible()
    return { userId, totpSecret }
}
