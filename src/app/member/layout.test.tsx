import { TestingProviders } from '@/tests/providers'
import { useAuth, useUser } from '@clerk/nextjs'
import { render, screen, act } from '@testing-library/react'
import router from 'next-router-mock'
import { beforeEach, expect, it, vi, type Mock } from 'vitest'
import MemberLayout from './layout'
import { getReviewerPublicKeyAction } from '@/server/actions/member.actions'

vi.mock('@/server/actions/member.actions', () => ({
    getReviewerPublicKeyAction: vi.fn(() => Promise.resolve(null)),
}))

beforeEach(() => {
    router.setCurrentUrl('/')
})

it('redirects if user is not found', async () => {
    ;(useAuth as Mock).mockImplementation(() => ({ isLoaded: true, userId: null }))
    ;(useUser as Mock).mockImplementation(() => ({ user: null, isSignedIn: false }))
    render(
        <MemberLayout>
            <div>Test</div>
        </MemberLayout>,
        { wrapper: TestingProviders },
    )

    expect(screen.queryByText('Test')).not.toBeNull()
    expect(router.asPath).toEqual('/account/signin')
})

it('redirects if keys are not found', async () => {
    ;(useAuth as Mock).mockImplementation(() => ({ isLoaded: true, userId: 1234 }))
    ;(useUser as Mock).mockImplementation(() => ({ user: 1234, isSignedIn: true }))
    // act waits for layoutEffect to finish
    await act(async () => {
        render(
            <MemberLayout>
                <div>Test</div>
            </MemberLayout>,
            { wrapper: TestingProviders },
        )
    })
    expect(getReviewerPublicKeyAction).toHaveBeenCalled()
    expect(screen.queryByText('Test')).not.toBeNull()

    expect(router.asPath).toEqual('/account/keys')
})
