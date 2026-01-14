import { reviewerKeyExistsAction } from '@/server/actions/user-keys.actions'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, Mock, vi } from 'vitest'
import { RequireReviewerKey } from './require-reviewer-key'

vi.mock('@/hooks/session', () => ({
    useSession: () => ({
        session: {
            orgs: { enclave: { type: 'enclave' } },
        },
    }),
}))
const push = vi.fn()
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push }),
}))

vi.mock('@/server/actions/user-keys.actions', () => ({
    reviewerKeyExistsAction: vi.fn(),
}))

describe('RequireReviewerKey', () => {
    it('redirects when key is missing', async () => {
        ;(reviewerKeyExistsAction as Mock).mockResolvedValue(false)
        render(<RequireReviewerKey />)
        await waitFor(() => expect(push).toHaveBeenCalledWith('/account/keys'))
    })

    it('does nothing when key exists', async () => {
        push.mockClear()
        ;(reviewerKeyExistsAction as Mock).mockResolvedValue(true)
        render(<RequireReviewerKey />)
        expect(push).not.toHaveBeenCalled()
    })
})
