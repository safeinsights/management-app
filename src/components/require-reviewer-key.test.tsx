import { reviewerKeyExistsAction } from '@/server/actions/user-keys.actions'
import { useSession } from '@/hooks/session'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, Mock, vi } from 'vitest'
import { RequireReviewerKey } from './require-reviewer-key'

vi.mock('@/hooks/session', () => ({ useSession: vi.fn() }))

const push = vi.fn()
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push }),
}))

vi.mock('@/server/actions/user-keys.actions', () => ({
    reviewerKeyExistsAction: vi.fn(),
}))

const mockSessionOrgs = (orgs: Record<string, { type: string }>) =>
    (useSession as Mock).mockReturnValue({ session: { orgs } })

describe('RequireReviewerKey', () => {
    it('redirects when key is missing', async () => {
        mockSessionOrgs({ enclave: { type: 'enclave' } })
        ;(reviewerKeyExistsAction as Mock).mockResolvedValue(false)
        render(<RequireReviewerKey />)
        await waitFor(() => expect(push).toHaveBeenCalledWith('/account/keys'))
    })

    it('does nothing when key exists', async () => {
        mockSessionOrgs({ enclave: { type: 'enclave' } })
        ;(reviewerKeyExistsAction as Mock).mockResolvedValue(true)
        render(<RequireReviewerKey />)
        expect(push).not.toHaveBeenCalled()
    })

    it('redirects lab researchers without a key', async () => {
        mockSessionOrgs({ lab: { type: 'lab' } })
        ;(reviewerKeyExistsAction as Mock).mockResolvedValue(false)
        render(<RequireReviewerKey />)
        await waitFor(() => expect(push).toHaveBeenCalledWith('/account/keys'))
    })
})
