// E2E Clerk fake — sign-in state machine.
//
// Mirrors the @clerk/types SignInResource surface the custom sign-in form drives:
//   create({identifier,password}) -> needs_second_factor (with phone_code factor)
//   prepareSecondFactor({strategy})
//   attemptSecondFactor({strategy, code:'424242'}) -> complete (+ createdSessionId)
//   reload(); attemptFirstFactor() for the reset-password flow.
// "Honors the real steps": password must be non-empty and the email must match a
// fixture; the MFA code must be 424242. Wrong inputs throw Clerk-shaped errors so the
// form's catch/error paths run.

import { fixtureForEmail, type FakeRole } from './fixtures'

const MFA_CODE = '424242'

class FakeClerkError extends Error {
    errors: Array<{ code: string; message: string; longMessage?: string }>
    constructor(code: string, message: string) {
        super(message)
        this.name = 'FakeClerkError'
        this.errors = [{ code, message, longMessage: message }]
    }
}

export type FakeSignIn = {
    status: 'needs_identifier' | 'needs_first_factor' | 'needs_second_factor' | 'complete'
    identifier: string | null
    createdSessionId: string | null
    supportedSecondFactors: Array<{ strategy: string; safeIdentifier?: string }> | null
    firstFactorVerification: { status: string | null }
    /** Resolved role for the matched fixture — used by setActive to set the cookie. */
    role: FakeRole | null
    create(params: { identifier: string; password?: string; strategy?: string }): Promise<FakeSignIn>
    prepareSecondFactor(params: { strategy: string }): Promise<FakeSignIn>
    attemptSecondFactor(params: { strategy: string; code: string }): Promise<FakeSignIn>
    attemptFirstFactor(params: { strategy: string; code: string; password?: string }): Promise<FakeSignIn>
    prepareFirstFactor(params: { strategy: string; [k: string]: unknown }): Promise<FakeSignIn>
    reload(): Promise<FakeSignIn>
}

export function createFakeSignIn(): FakeSignIn {
    const signIn: FakeSignIn = {
        status: 'needs_identifier',
        identifier: null,
        createdSessionId: null,
        supportedSecondFactors: null,
        firstFactorVerification: { status: null },
        role: null,

        async create({ identifier, password, strategy }) {
            signIn.identifier = identifier
            const fixture = fixtureForEmail(identifier)
            signIn.role = fixture?.role ?? null

            // Password reset flow uses strategy='reset_password_email_code' without a password.
            if (strategy === 'reset_password_email_code') {
                if (!fixture) throw new FakeClerkError('form_identifier_not_found', "Couldn't find your account.")
                signIn.status = 'needs_first_factor'
                signIn.firstFactorVerification = { status: 'unverified' }
                return signIn
            }

            if (!password || password === 'wrong') {
                throw new FakeClerkError('form_password_incorrect', 'Password is incorrect. Try again.')
            }

            // Known fixture or a freshly-created invite account: both land on the MFA
            // challenge. A non-fixture email has no role, so attemptSecondFactor can't
            // complete it — mirroring a new Clerk account with no enrolled factors (the
            // signup flow surfaces an actionable error for that, see signup/page.tsx).
            signIn.status = 'needs_second_factor'
            signIn.supportedSecondFactors = [{ strategy: 'phone_code', safeIdentifier: '+•• ••• ••42' }]
            return signIn
        },

        async prepareFirstFactor() {
            signIn.firstFactorVerification = { status: 'unverified' }
            return signIn
        },

        async attemptFirstFactor({ code }) {
            if (code !== MFA_CODE) {
                throw new FakeClerkError('form_code_incorrect', 'Invalid code. Try again.')
            }
            signIn.status = 'complete'
            signIn.createdSessionId = `e2e-session-${signIn.role}`
            signIn.firstFactorVerification = { status: 'verified' }
            return signIn
        },

        async prepareSecondFactor() {
            return signIn
        },

        async attemptSecondFactor({ code }) {
            if (code !== MFA_CODE) {
                throw new FakeClerkError('form_code_incorrect', 'Invalid code. Try again.')
            }
            signIn.status = 'complete'
            signIn.createdSessionId = `e2e-session-${signIn.role}`
            return signIn
        },

        async reload() {
            return signIn
        },
    }
    return signIn
}
