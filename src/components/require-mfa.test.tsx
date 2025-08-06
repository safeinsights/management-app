import { TestingProviders } from '@/tests/providers'
import { useUser } from '@clerk/nextjs'
import { render, act, waitFor } from '@testing-library/react'
import router from 'next-router-mock'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { RequireMFA } from './require-mfa'

vi.mock('@/server/actions/org.actions', () => ({
    getReviewerPublicKeyAction: vi.fn(() => Promise.resolve(null)),
}))

describe('RequireMFA', () => {
    describe('when MFA is not enabled', () => {
        beforeEach(() => {
            router.setCurrentUrl('/')
        })

        it('redirects if mfa is not set', async () => {
            ;(useUser as Mock).mockImplementation(() => ({ user: { twoFactorEnabled: false } }))

            // act waits for layoutEffect to finish
            await act(async () => {
                render(<RequireMFA />, { wrapper: TestingProviders })
            })

            expect(router.asPath).toEqual('/account/mfa')
        })
    })

    describe('invite signup → session lost → re-login MFA flow', () => {
        beforeEach(() => {
            router.setCurrentUrl('/researcher/dashboard')
        })

        it('redirects to /account/mfa until MFA is completed', async () => {
            // 1. brand-new account, Clerk hasn’t set twoFactorEnabled yet (undefined)
            ;(useUser as Mock).mockReturnValue({ user: { twoFactorEnabled: undefined } })

            await act(async () => {
                render(<RequireMFA />, { wrapper: TestingProviders })
            })

            await waitFor(() => expect(router.asPath).toBe('/account/mfa'))

            // 2. user completes MFA → Clerk now returns twoFactorEnabled === true
            ;(useUser as Mock).mockReturnValue({ user: { twoFactorEnabled: true } })
            router.setCurrentUrl('/researcher/dashboard')

            await act(async () => {
                render(<RequireMFA />, { wrapper: TestingProviders })
            })

            // stays on requested page – no more redirect
            expect(router.asPath).toBe('/researcher/dashboard')
        })
    })
})
