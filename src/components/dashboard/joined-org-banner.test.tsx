import { beforeEach, describe, expect, it } from 'vitest'
import { renderWithProviders, waitFor, userEvent } from '@/tests/unit.helpers'
import { JOINED_ORG_STORAGE_KEY, markOrgJoined } from '@/lib/joined-org'
import { JoinedOrgBanner } from './joined-org-banner'

describe('JoinedOrgBanner', () => {
    beforeEach(() => sessionStorage.clear())

    it('renders nothing when no org was just joined', () => {
        const { queryByTestId } = renderWithProviders(<JoinedOrgBanner />)

        expect(queryByTestId('joined-org-banner')).toBeNull()
    })

    it('reveals the banner and clears the flag', async () => {
        sessionStorage.setItem(JOINED_ORG_STORAGE_KEY, 'ASU Research Lab')
        const { getByTestId } = renderWithProviders(<JoinedOrgBanner />)

        await waitFor(() => expect(getByTestId('joined-org-banner')).toHaveTextContent('ASU Research Lab'))
        expect(sessionStorage.getItem(JOINED_ORG_STORAGE_KEY)).toBeNull()
    })

    // OTTER-788. The linking step overwrites the flag, so the banner is the one place that reports
    // both the membership and the newly linked address.
    it('names the linked address when an invited email was merged into the account', async () => {
        markOrgJoined('ASU Research Lab', 'invited@example.com')
        const { getByTestId } = renderWithProviders(<JoinedOrgBanner />)

        await waitFor(() =>
            expect(getByTestId('joined-org-banner')).toHaveTextContent(
                'You have been added to ASU Research Lab and invited@example.com is now linked to your account.',
            ),
        )
    })

    it('keeps the plain copy when nothing was linked', async () => {
        markOrgJoined('ASU Research Lab')
        const { getByTestId } = renderWithProviders(<JoinedOrgBanner />)

        await waitFor(() =>
            expect(getByTestId('joined-org-banner')).toHaveTextContent('You have been added to ASU Research Lab.'),
        )
    })

    it('reads a legacy bare org name even when it parses as JSON', async () => {
        sessionStorage.setItem(JOINED_ORG_STORAGE_KEY, '2024')
        const { getByTestId } = renderWithProviders(<JoinedOrgBanner />)

        await waitFor(() => expect(getByTestId('joined-org-banner')).toHaveTextContent('You have been added to 2024.'))
        expect(sessionStorage.getItem(JOINED_ORG_STORAGE_KEY)).toBeNull()
    })

    it('dismisses when the close button is clicked', async () => {
        sessionStorage.setItem(JOINED_ORG_STORAGE_KEY, 'ASU Research Lab')
        const { getByTestId, queryByTestId } = renderWithProviders(<JoinedOrgBanner />)

        await waitFor(() => expect(getByTestId('joined-org-banner')).toBeInTheDocument())
        await userEvent.click(getByTestId('joined-org-banner').querySelector('button')!)
        await waitFor(() => expect(queryByTestId('joined-org-banner')).toBeNull())
    })
})
