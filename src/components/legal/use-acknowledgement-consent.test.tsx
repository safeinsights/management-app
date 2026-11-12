import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { UserStudyAgreements } from '@/app/legal/user-study-agreements'
import {
    act,
    createTestQueryWrapper,
    faker,
    insertTestOrg,
    insertTestStudyAgreement,
    insertTestStudyOnly,
    insertTestUser,
    mockSessionWithTestData,
    renderHook,
    renderWithProviders,
    resetLegalDocuments,
    userEvent,
} from '@/tests/unit.helpers'
import { RequireStudyAgreement } from './require-study-agreement'
import { useAcknowledgementConsent } from './use-acknowledgement-consent'

beforeEach(resetLegalDocuments)

const arrangeStudyForCurrentUser = async (title: string) => {
    const dataPartner = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
    const researchLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
    const { user: researcher } = await insertTestUser({
        org: { id: researchLab.id, slug: researchLab.slug, type: 'lab' },
    })

    const { study } = await insertTestStudyOnly({
        org: dataPartner,
        submittedByOrg: researchLab,
        researcherId: researcher.id,
        title,
        status: 'APPROVED',
        withStudyAgreement: false,
    })

    await mockSessionWithTestData({ orgSlug: researchLab.slug, orgType: 'lab' })
    return study
}

describe('useAcknowledgementConsent', () => {
    // The gate and the table are mounted together here because that is the state the hook has to
    // leave behind: the table's staleTime outlives the modal, so only an invalidation refreshes it.
    it('refreshes the agreements table the ack belongs in', async () => {
        const title = `Gated ${faker.string.alpha(6)}`
        const study = await arrangeStudyForCurrentUser(title)
        await insertTestStudyAgreement({ studyId: study.id })

        renderWithProviders(
            <>
                <RequireStudyAgreement studyId={study.id} />
                <UserStudyAgreements />
            </>,
        )

        await waitFor(() =>
            expect(screen.getByText('You have not acknowledged any Study Agreements yet')).toBeDefined(),
        )

        await screen.findByRole('dialog')
        await userEvent.click(screen.getByRole('checkbox'))
        await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

        await waitFor(() => expect(screen.getByText(title)).toBeDefined())
        // The table can refresh before the gate's own refetch, which closes the dialog.
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    // A Privacy Notice joining the Terms of Service on screen is a new question, not the one ticked.
    it('clears the tick when the set of versions on screen changes', async () => {
        const { result, rerender } = renderHook(
            ({ versionIds }) => useAcknowledgementConsent({ versionIds, invalidateKey: ['consent-test'] }),
            { wrapper: createTestQueryWrapper(), initialProps: { versionIds: ['tos-v1'] } },
        )

        act(() => result.current.onCheckedChange(true))
        expect(result.current.isChecked).toBe(true)

        rerender({ versionIds: ['tos-v1', 'pn-v1'] })
        expect(result.current.isChecked).toBe(false)
    })

    it('never reads as ticked with nothing on screen', async () => {
        const { result } = renderHook(
            () => useAcknowledgementConsent({ versionIds: [], invalidateKey: ['consent-test'] }),
            { wrapper: createTestQueryWrapper() },
        )

        act(() => result.current.onCheckedChange(true))
        expect(result.current.isChecked).toBe(false)
    })
})
