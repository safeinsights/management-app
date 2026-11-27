// Mirrors the signals SignInFutureResource surface the custom auth flows drive. Like real Clerk,
// one sign-in attempt is shared by every component, and wrong inputs come back as Clerk-shaped
// `{ error }` values instead of throwing.

import { fixtureForEmail, type FakeRole } from './fixtures'

export const MFA_CODE = '424242'

class FakeClerkError extends Error {
    errors: Array<{ code: string; message: string; longMessage?: string }>
    constructor(code: string, message: string) {
        super(message)
        this.name = 'FakeClerkError'
        this.errors = [{ code, message, longMessage: message }]
    }
}

type FakeResult = Promise<{ error: FakeClerkError | null }>

export type FakeSignIn = {
    status: 'needs_identifier' | 'needs_first_factor' | 'needs_second_factor' | 'needs_new_password' | 'complete'
    identifier: string | null
    createdSessionId: string | null
    supportedSecondFactors: Array<{ strategy: string; safeIdentifier?: string }>
    firstFactorVerification: { status: string | null }
    role: FakeRole | null
    password(params: { identifier: string; password: string }): FakeResult
    create(params: { identifier: string }): FakeResult
    resetPasswordEmailCode: {
        sendCode(): FakeResult
        verifyCode(params: { code: string }): FakeResult
        submitPassword(params: { password: string; signOutOfOtherSessions?: boolean }): FakeResult
    }
    mfa: {
        sendPhoneCode(): FakeResult
        verifyPhoneCode(params: { code: string }): FakeResult
        verifyTOTP(params: { code: string }): FakeResult
        verifyBackupCode(params: { code: string }): FakeResult
    }
    reset(): FakeResult
}

const ok = async () => ({ error: null })
const fail = async (code: string, message: string) => ({ error: new FakeClerkError(code, message) })

const startAttempt = (identifier: string) => {
    fakeSignIn.identifier = identifier
    fakeSignIn.role = fixtureForEmail(identifier)?.role ?? null
    fakeSignIn.createdSessionId = null
}

const complete = () => {
    fakeSignIn.status = 'complete'
    fakeSignIn.createdSessionId = `e2e-session-${fakeSignIn.role}`
}

const verifySecondFactor = async ({ code }: { code: string }) => {
    if (code !== MFA_CODE) return fail('form_code_incorrect', 'Invalid code. Try again.')
    complete()
    return ok()
}

export const fakeSignIn: FakeSignIn = {
    status: 'needs_identifier',
    identifier: null,
    createdSessionId: null,
    supportedSecondFactors: [],
    firstFactorVerification: { status: null },
    role: null,

    async password({ identifier, password }) {
        startAttempt(identifier)
        if (!password || password === 'wrong') {
            return fail('form_password_incorrect', 'Password is incorrect. Try again.')
        }

        // A non-fixture email has no role, so no second factor completes it, mirroring a new
        // Clerk account with no enrolled factors.
        fakeSignIn.status = 'needs_second_factor'
        fakeSignIn.supportedSecondFactors = [{ strategy: 'phone_code', safeIdentifier: '+•• ••• ••42' }]
        return ok()
    },

    async create({ identifier }) {
        startAttempt(identifier)
        if (!fakeSignIn.role) return fail('form_identifier_not_found', "Couldn't find your account.")
        fakeSignIn.status = 'needs_first_factor'
        return ok()
    },

    resetPasswordEmailCode: {
        async sendCode() {
            fakeSignIn.firstFactorVerification = { status: 'unverified' }
            return ok()
        },
        async verifyCode({ code }) {
            if (code !== MFA_CODE) return fail('form_code_incorrect', 'Invalid code. Try again.')
            fakeSignIn.status = 'needs_new_password'
            fakeSignIn.firstFactorVerification = { status: 'verified' }
            return ok()
        },
        async submitPassword() {
            complete()
            return ok()
        },
    },

    mfa: {
        sendPhoneCode: ok,
        verifyPhoneCode: verifySecondFactor,
        verifyTOTP: verifySecondFactor,
        verifyBackupCode: verifySecondFactor,
    },

    async reset() {
        fakeSignIn.status = 'needs_identifier'
        fakeSignIn.identifier = null
        fakeSignIn.createdSessionId = null
        fakeSignIn.supportedSecondFactors = []
        fakeSignIn.firstFactorVerification = { status: null }
        fakeSignIn.role = null
        return ok()
    },
}
