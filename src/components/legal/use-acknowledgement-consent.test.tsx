import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { UserStudyAgreements } from '@/app/legal/user-study-agreements'
import {
    faker,
    insertTestOrg,
    insertTestStudyAgreement,
    insertTestStudyOnly,
    insertTestUser,
    mockSessionWithTestData,
    renderWithProviders,
    resetLegalDocuments,
    userEvent,
} from '@/tests/unit.helpers'
import { RequireStudyAgreement } from './require-study-agreement'

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
    })
})
