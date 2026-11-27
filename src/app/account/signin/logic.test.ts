import type { SignInFutureResource } from '@clerk/nextjs/types'
import { describe, expect, it, vi } from 'vitest'
import { isUsingPhoneMFA, sendPhoneCodeIfOnlyFactor, throwOnClerkError } from './logic'

const signInWithFactors = (strategies: string[]) =>
    ({
        supportedSecondFactors: strategies.map((strategy) => ({ strategy })),
        mfa: { sendPhoneCode: vi.fn().mockResolvedValue({ error: null }) },
    }) as unknown as SignInFutureResource

describe('MFA Utilities', () => {
    describe('isUsingPhoneMFA', () => {
        it('should return true when SMS is supported and TOTP is not', () => {
            expect(isUsingPhoneMFA(signInWithFactors(['phone_code']))).toBe(true)
        })

        it('should return false when both SMS and TOTP are supported', () => {
            expect(isUsingPhoneMFA(signInWithFactors(['phone_code', 'totp']))).toBe(false)
        })

        it('should return false when no second factors are supported', () => {
            expect(isUsingPhoneMFA(signInWithFactors([]))).toBe(false)
        })
    })

    describe('sendPhoneCodeIfOnlyFactor', () => {
        it('sends an SMS code when phone is the only second factor', async () => {
            const signIn = signInWithFactors(['phone_code'])

            await sendPhoneCodeIfOnlyFactor(signIn)

            expect(signIn.mfa.sendPhoneCode).toHaveBeenCalledOnce()
        })

        it('does not send an SMS code when an authenticator app is also set up', async () => {
            const signIn = signInWithFactors(['phone_code', 'totp'])

            await sendPhoneCodeIfOnlyFactor(signIn)

            expect(signIn.mfa.sendPhoneCode).not.toHaveBeenCalled()
        })
    })

    describe('throwOnClerkError', () => {
        it('resolves when the call returns no error', async () => {
            await expect(throwOnClerkError(Promise.resolve({ error: null }))).resolves.toBeUndefined()
        })

        it('rejects with the returned error object unchanged', async () => {
            const error = { errors: [{ code: 'form_code_incorrect', message: 'Incorrect code' }] }

            await expect(throwOnClerkError(Promise.resolve({ error }))).rejects.toBe(error)
        })
    })
})
