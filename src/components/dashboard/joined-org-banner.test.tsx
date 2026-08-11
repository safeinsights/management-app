import { beforeEach, describe, expect, it } from 'vitest'
import {
    actionResult,
    db,
    mockSessionWithTestData,
    renderWithProviders,
    waitFor,
    userEvent,
} from '@/tests/unit.helpers'
import { JOINED_ORG_STORAGE_KEY } from '@/lib/joined-org'
import { userKeyExistsAction } from '@/server/actions/user-keys.actions'
import { JoinedOrgBanner } from './joined-org-banner'

// insertTestUser only seeds a public key for enclave orgs, so orgType picks the user's key state:
// 'enclave' is keyed, 'lab' is the keyless user RequireUserKey bounces to key setup.
const KEYED = 'enclave'
const KEYLESS = 'lab'

describe('JoinedOrgBanner', () => {
    beforeEach(() => sessionStorage.clear())

    it('renders nothing when no org was just joined', async () => {
        await mockSessionWithTestData({ orgType: KEYED })
        const { queryByTestId } = renderWithProviders(<JoinedOrgBanner />)

        expect(queryByTestId('joined-org-banner')).toBeNull()
    })

    it('reveals the banner and clears the flag once the user is keyed', async () => {
        await mockSessionWithTestData({ orgType: KEYED })
        sessionStorage.setItem(JOINED_ORG_STORAGE_KEY, 'ASU Research Lab')
        const { getByTestId } = renderWithProviders(<JoinedOrgBanner />)

        await waitFor(() => expect(getByTestId('joined-org-banner')).toHaveTextContent('ASU Research Lab'))
        expect(sessionStorage.getItem(JOINED_ORG_STORAGE_KEY)).toBeNull()
    })

    // OTTER-639: the transient mount must not spend the flag, however long the key check takes.
    it('keeps the flag for a keyless user awaiting key setup, then reveals on the real landing', async () => {
        const { user } = await mockSessionWithTestData({ orgType: KEYLESS })
        sessionStorage.setItem(JOINED_ORG_STORAGE_KEY, 'ASU Research Lab')

        const transient = renderWithProviders(<JoinedOrgBanner />)
        // The component awaits this same check before it can reveal, so awaiting it here means an
        // intact flag below is the settled result rather than a snapshot taken too early.
        expect(actionResult(await userKeyExistsAction())).toBe(false)
        expect(sessionStorage.getItem(JOINED_ORG_STORAGE_KEY)).toBe('ASU Research Lab')
        expect(transient.queryByTestId('joined-org-banner')).toBeNull()
        transient.unmount()

        await db
            .insertInto('userPublicKey')
            .values({ userId: user.id, publicKey: Buffer.from('testPublicKey1'), fingerprint: 'testFingerprint1' })
            .executeTakeFirstOrThrow()

        const { getByTestId } = renderWithProviders(<JoinedOrgBanner />)
        await waitFor(() => expect(getByTestId('joined-org-banner')).toHaveTextContent('ASU Research Lab'))
    })

    it('dismisses when the close button is clicked', async () => {
        await mockSessionWithTestData({ orgType: KEYED })
        sessionStorage.setItem(JOINED_ORG_STORAGE_KEY, 'ASU Research Lab')
        const { getByTestId, queryByTestId } = renderWithProviders(<JoinedOrgBanner />)

        await waitFor(() => expect(getByTestId('joined-org-banner')).toBeInTheDocument())
        await userEvent.click(getByTestId('joined-org-banner').querySelector('button')!)
        await waitFor(() => expect(queryByTestId('joined-org-banner')).toBeNull())
    })
})
