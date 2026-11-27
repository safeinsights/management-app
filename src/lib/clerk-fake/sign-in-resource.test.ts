import { beforeEach, describe, expect, it } from '@/tests/unit.helpers'
import { ROLE_FIXTURES } from './fixtures'
import { fakeSignIn, MFA_CODE } from './sign-in-resource'

const researcherEmail = ROLE_FIXTURES.researcher.email

describe('fake signals sign-in', () => {
    beforeEach(async () => {
        await fakeSignIn.reset()
    })

    it('returns a Clerk-shaped error for a wrong password instead of throwing', async () => {
        const { error } = await fakeSignIn.password({ identifier: researcherEmail, password: 'wrong' })

        expect(error?.errors[0].code).toBe('form_password_incorrect')
    })

    it('completes a fixture sign-in after the MFA code', async () => {
        await fakeSignIn.password({ identifier: researcherEmail, password: 'whatever' })
        expect(fakeSignIn.status).toBe('needs_second_factor')

        const { error } = await fakeSignIn.mfa.verifyPhoneCode({ code: MFA_CODE })

        expect(error).toBeNull()
        expect(fakeSignIn.status).toBe('complete')
        expect(fakeSignIn.createdSessionId).toBe('e2e-session-researcher')
    })

    it('rejects a wrong MFA code', async () => {
        await fakeSignIn.password({ identifier: researcherEmail, password: 'whatever' })

        const { error } = await fakeSignIn.mfa.verifyTOTP({ code: '000000' })

        expect(error?.errors[0].code).toBe('form_code_incorrect')
        expect(fakeSignIn.status).toBe('needs_second_factor')
    })

    it('reports an unknown email when a password reset starts', async () => {
        const { error } = await fakeSignIn.create({ identifier: 'nobody@example.com' })

        expect(error?.errors[0].code).toBe('form_identifier_not_found')
    })

    it('verifies the reset code before it takes the new password', async () => {
        await fakeSignIn.create({ identifier: researcherEmail })
        await fakeSignIn.resetPasswordEmailCode.sendCode()
        await fakeSignIn.resetPasswordEmailCode.verifyCode({ code: MFA_CODE })
        expect(fakeSignIn.status).toBe('needs_new_password')

        await fakeSignIn.resetPasswordEmailCode.submitPassword({ password: 'N3w-password!' })

        expect(fakeSignIn.status).toBe('complete')
        expect(fakeSignIn.createdSessionId).toBe('e2e-session-researcher')
    })
})
