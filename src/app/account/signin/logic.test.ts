import { type SignInResource } from '@clerk/types'
import { isUsingPhoneMFA, signInToMFAState } from './logic'
import { describe, it, expect, vi } from 'vitest'

describe('MFA Utilities', () => {
    describe('isUsingPhoneMFA', () => {
        it('should return true when SMS is supported and TOTP is not', () => {
            const mockSignIn = {
                supportedSecondFactors: [
                    { strategy: 'phone_code' }
                ]
            } as SignInResource

            expect(isUsingPhoneMFA(mockSignIn)).toBe(true)
        })

        it('should return false when both SMS and TOTP are supported', () => {
            const mockSignIn = {
                supportedSecondFactors: [
                    { strategy: 'phone_code' },
                    { strategy: 'totp' }
                ]
            } as SignInResource

            expect(isUsingPhoneMFA(mockSignIn)).toBe(false)
        })

        it('should return false when no second factors are supported', () => {
            const mockSignIn = {
                supportedSecondFactors: []
            } as unknown as SignInResource

            expect(isUsingPhoneMFA(mockSignIn)).toBe(false)
        })
    })

    describe('signInToMFAState', () => {
        it('should prepare SMS factor and return proper state when SMS MFA is used', async () => {
            const mockSignIn = {
                supportedSecondFactors: [{ strategy: 'phone_code' }],
                prepareSecondFactor: vi.fn().mockResolvedValue(undefined)
            } as unknown as SignInResource

            const result = await signInToMFAState(mockSignIn)

            expect(mockSignIn.prepareSecondFactor).toHaveBeenCalledWith({ strategy: 'phone_code' })
            expect(result).toEqual({ signIn: mockSignIn, usingSMS: true })
        })

        it('should not prepare second factor when SMS MFA is not used', async () => {
            const mockSignIn = {
                supportedSecondFactors: [
                    { strategy: 'phone_code' },
                    { strategy: 'totp' }
                ],
                prepareSecondFactor: vi.fn().mockResolvedValue(undefined)
            } as unknown as SignInResource

            const result = await signInToMFAState(mockSignIn)

            expect(mockSignIn.prepareSecondFactor).not.toHaveBeenCalled()
            expect(result).toEqual({ signIn: mockSignIn, usingSMS: false })
        })
    })
})
