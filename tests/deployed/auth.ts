import { expect, type Page } from '@playwright/test'
import { fillPinInput } from '../flows/lexical'
import { type Account, currentCode } from './env'

// Real Clerk sign-in through the app's own form, as a person does it. Ported from
// qa-review/src/engine/auth.ts; the selectors are the app's (src/app/account/signin/*).

// The one marker every signed-in page shares.
export const signedInMarker = (page: Page) => page.getByRole('link', { name: 'My studies', exact: true }).first()

const alreadySignedInNotice = (page: Page) => page.getByText(/already signed in/i).first()

// Reaches a hydrated email/password form from any prior state: a leftover session is signed out
// first, and the "already signed in" interstitial dismissed if it still wins the race.
async function reachSignInForm(page: Page) {
    await page.goto('/account/signin', { waitUntil: 'domcontentloaded' })
    const signedOut = await page
        .evaluate(async () => {
            const clerk = (window as unknown as { Clerk?: { signOut?: () => Promise<void> } }).Clerk
            if (!clerk?.signOut) return false
            await clerk.signOut()
            return true
        })
        .catch(() => false)
    if (signedOut) await page.goto('/account/signin', { waitUntil: 'domcontentloaded' })

    const emailField = page.getByRole('textbox', { name: 'Email' })
    const differentAccount = page.getByRole('button', { name: /sign in with a different account/i })
    await Promise.race([emailField.waitFor(), differentAccount.waitFor()]).catch(() => {})
    if (await differentAccount.isVisible()) {
        // The button disables itself while Clerk tears the session down, so re-click until the form shows.
        await expect(async () => {
            await differentAccount.click().catch(() => {})
            await expect(emailField).toBeVisible()
        }).toPass()
    }
    await expect(emailField).toBeVisible()
}

// What the page says the active session is. Clerk can hold several sessions while switching
// accounts; the app follows the ACTIVE one, so that is what gets asserted.
export async function activeSession(page: Page): Promise<{ email: string | null; sessions: number }> {
    return page.evaluate(() => {
        const clerk = (
            window as unknown as {
                Clerk?: {
                    session?: { user?: { primaryEmailAddress?: { emailAddress?: string } } }
                    client?: { activeSessions?: unknown[] }
                }
            }
        ).Clerk
        return {
            email: clerk?.session?.user?.primaryEmailAddress?.emailAddress ?? null,
            sessions: clerk?.client?.activeSessions?.length ?? 0,
        }
    })
}

// The global acknowledgement modal (Terms of Service, Privacy Notice, a participation agreement)
// greets a user who owes one on any app page. Accept whatever is shown, one document at a time.
export async function acknowledgeLegalDocuments(page: Page) {
    const modal = page
        .getByRole('dialog')
        .filter({ has: page.getByRole('checkbox') })
        .filter({ hasText: /acknowledge/i })
    for (let documents = 0; documents < 5; documents++) {
        if (!(await modal.isVisible())) return
        await modal.getByRole('checkbox').check()
        await modal.getByRole('button', { name: 'Continue' }).click()
        await expect(modal).toBeHidden()
    }
}

export async function signIn(page: Page, account: Account) {
    await reachSignInForm(page)
    await page.getByRole('textbox', { name: 'Email' }).fill(account.email)
    await page.getByLabel('Password', { exact: true }).fill(account.password)
    await page.getByRole('button', { name: 'Login' }).click()

    // Then either the second-factor picker (which depends on the environment's Clerk instance) or,
    // for an account without one, the app itself.
    const sms = page.getByRole('button', { name: 'SMS Verification' })
    const authenticator = page.getByRole('button', { name: /authenticator/i })
    await Promise.race([sms.waitFor(), authenticator.waitFor(), signedInMarker(page).waitFor()]).catch(() => {})
    const choice = (await authenticator.isVisible()) ? authenticator : (await sms.isVisible()) ? sms : null
    if (choice) {
        await expect(async () => {
            await choice.click().catch(() => {})
            await expect(page.getByTestId('sms-pin-input')).toBeVisible()
        }).toPass()
        await fillPinInput(page, currentCode(account.secondFactor), 'sms-pin-input')
        await page.getByRole('button', { name: /verify code/i }).click()
    }

    // A completed sign-in can land back on the sign-in page as the interstitial for this very account.
    await Promise.race([signedInMarker(page).waitFor(), alreadySignedInNotice(page).waitFor()]).catch(() => {})
    if (await alreadySignedInNotice(page).isVisible()) {
        await expect(page.getByText(/signed in as/i).first()).toContainText(account.email, { ignoreCase: true })
        await page.getByRole('button', { name: 'Continue', exact: true }).click()
    }

    // The gates the app puts before its pages, named so a new environment's setup is actionable.
    if (page.url().includes('/account/mfa')) {
        throw new Error(`${account.email} has no second factor enrolled; the app requires one before any page.`)
    }
    if (page.url().includes('/account/keys')) {
        throw new Error(
            `${account.email} has no security key; set one with PATCH /api/qa/users/${account.email} {publicKey} (qar fix-account).`,
        )
    }
    await expect(signedInMarker(page)).toBeVisible()
    await acknowledgeLegalDocuments(page)

    const session = await activeSession(page)
    expect(session.email?.toLowerCase(), 'the active Clerk session must be the account that just signed in').toBe(
        account.email.toLowerCase(),
    )
    expect(session.sessions, 'a leftover session from another account would let the app act as it').toBe(1)
}

// A Clerk session JWT from a signed-in page, for the QA routes (they read the Authorization
// header, not the cookie). Short-lived, so minted per call.
export async function sessionToken(page: Page): Promise<string> {
    let token = ''
    await expect(async () => {
        token =
            (await page.evaluate(async () => {
                const clerk = (
                    window as unknown as { Clerk?: { session?: { getToken(o?: unknown): Promise<string | null> } } }
                ).Clerk
                return (await clerk?.session?.getToken({ skipCache: true })) ?? ''
            })) || ''
        expect(token).not.toBe('')
    }).toPass()
    return token
}
