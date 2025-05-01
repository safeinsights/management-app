import { TestingProviders } from '@/tests/providers'
import { useUser } from '@clerk/nextjs'
import { render, act } from '@testing-library/react'
import router from 'next-router-mock'
import { beforeEach, expect, it, vi, type Mock } from 'vitest'
import { RequireMFA } from './require-mfa'

vi.mock('@/server/actions/org.actions', () => ({
    getReviewerPublicKeyAction: vi.fn(() => Promise.resolve(null)),
}))

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
