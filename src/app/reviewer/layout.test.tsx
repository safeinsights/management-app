import { TestingProviders } from '@/tests/providers'
import { useAuth, useClerk, useSession, useUser } from '@clerk/nextjs'
import { render, act, waitFor } from '@testing-library/react'
import router from 'next-router-mock'
import { beforeEach, expect, it, vi, type Mock } from 'vitest'
import { getReviewerPublicKeyAction } from '@/server/actions/org.actions'
import ReviewerLayout from './layout'

vi.mock('@/server/actions/org.actions', () => ({
    getReviewerPublicKeyAction: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@clerk/clerk-react', () => ({
    useSession: vi.fn(() => ({ session: { id: 'sess_1', lastActiveAt: Date.now() } })),
    useClerk: vi.fn(() => ({ signOut: vi.fn(), isLoaded: true })),
}))

beforeEach(() => {
    router.setCurrentUrl('/')
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_dummy')
})

it('redirects if keys are not present', async () => {
    ;(useUser as Mock).mockImplementation(() => ({
        user: {
            twoFactorEnabled: true,
            organizationMemberships: [],
        },
    }))
    ;(useAuth as Mock).mockImplementation(() => ({ isLoaded: true, userId: 'test-user', orgSlug: null }))
    ;(useClerk as Mock).mockImplementation(() => ({ isLoaded: true, signOut: vi.fn() }))
    ;(useSession as Mock).mockImplementation(() => ({ session: { id: 'test-session-id' } }))

    await act(async () => {
        render(
            <ReviewerLayout>
                <div>hello world</div>
            </ReviewerLayout>,
            { wrapper: TestingProviders },
        )
    })

    expect(getReviewerPublicKeyAction).toHaveBeenCalled()
    await waitFor(() => expect(router.asPath).toBe('/account/keys'))
})
