import { TestingProviders } from '@/tests/providers'
import { useUser } from '@clerk/nextjs'
import { render, act } from '@testing-library/react'
import router from 'next-router-mock'
import { beforeEach, expect, it, vi, type Mock } from 'vitest'
import { RequireReviewerKeys } from './require-reviewer-keys'
import { getReviewerPublicKeyAction } from '@/server/actions/member.actions'

vi.mock('@/server/actions/member.actions', () => ({
    getReviewerPublicKeyAction: vi.fn(() => Promise.resolve(null)),
}))

beforeEach(() => {
    router.setCurrentUrl('/')
})

it('redirects if keys are not present', async () => {
    ;(useUser as Mock).mockImplementation(() => ({ user: { twoFactorEnabled: false } }))

    await act(async () => {
        render(<RequireReviewerKeys />, { wrapper: TestingProviders })
    })

    expect(getReviewerPublicKeyAction).toHaveBeenCalled()
    expect(router.asPath).toEqual('/account/keys')
})
