import { beforeEach, describe, expect, it } from 'vitest'
import { renderWithProviders, waitFor, userEvent } from '@/tests/unit.helpers'
import { JOINED_ORG_STORAGE_KEY } from '@/lib/joined-org'
import { JoinedOrgBanner, REVEAL_DELAY_MS } from './joined-org-banner'

const REVEAL_TIMEOUT = REVEAL_DELAY_MS + 2000

describe('JoinedOrgBanner', () => {
    beforeEach(() => sessionStorage.clear())

    it('renders nothing when no org was just joined', () => {
        const { queryByTestId } = renderWithProviders(<JoinedOrgBanner />)
        expect(queryByTestId('joined-org-banner')).toBeNull()
    })

    it('reveals the banner after the delay and clears the flag', async () => {
        sessionStorage.setItem(JOINED_ORG_STORAGE_KEY, 'ASU Research Lab')
        const { getByTestId } = renderWithProviders(<JoinedOrgBanner />)

        await waitFor(() => expect(getByTestId('joined-org-banner')).toHaveTextContent('ASU Research Lab'), {
            timeout: REVEAL_TIMEOUT,
        })
        expect(sessionStorage.getItem(JOINED_ORG_STORAGE_KEY)).toBeNull()
    })

    it('keeps the flag when unmounted before the delay (transient dashboard mount)', async () => {
        sessionStorage.setItem(JOINED_ORG_STORAGE_KEY, 'ASU Research Lab')
        const { unmount, queryByTestId } = renderWithProviders(<JoinedOrgBanner />)

        unmount()
        // Wait past the delay to prove the cancelled timer never fires.
        await new Promise((resolve) => setTimeout(resolve, REVEAL_TIMEOUT))

        expect(queryByTestId('joined-org-banner')).toBeNull()
        expect(sessionStorage.getItem(JOINED_ORG_STORAGE_KEY)).toBe('ASU Research Lab')
    })

    it('dismisses when the close button is clicked', async () => {
        sessionStorage.setItem(JOINED_ORG_STORAGE_KEY, 'ASU Research Lab')
        const { getByTestId, queryByTestId } = renderWithProviders(<JoinedOrgBanner />)

        await waitFor(() => expect(getByTestId('joined-org-banner')).toBeInTheDocument(), { timeout: REVEAL_TIMEOUT })
        await userEvent.click(getByTestId('joined-org-banner').querySelector('button')!)
        await waitFor(() => expect(queryByTestId('joined-org-banner')).toBeNull())
    })
})
