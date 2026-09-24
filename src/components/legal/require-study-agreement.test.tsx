import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/database'
import type { StudyStatus } from '@/database/types'
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
import { StudyAgreementPreparingNotice } from './study-agreement-preparing-notice'

beforeEach(resetLegalDocuments)

// A study on a lab the session user belongs to, so they are a party to its agreement. The two org
// names are set explicitly: the notice prints both, and faker could hand back the same name twice.
const arrangeStudyForCurrentUser = async ({ status = 'APPROVED' as StudyStatus } = {}) => {
    const dataPartner = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave', name: 'Partner Enclave' })
    const researchLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab', name: 'Curious Lab' })
    const { user: researcher } = await insertTestUser({
        org: { id: researchLab.id, slug: researchLab.slug, type: 'lab' },
    })

    // This file publishes its own agreements, so the fixture writes none.
    const { study } = await insertTestStudyOnly({
        org: dataPartner,
        submittedByOrg: researchLab,
        researcherId: researcher.id,
        status,
        withStudyAgreement: false,
    })

    const { user } = await mockSessionWithTestData({ orgSlug: researchLab.slug, orgType: 'lab' })
    return { study, user, dataPartner, researchLab }
}

const acknowledgementsFor = (userId: string) =>
    db
        .selectFrom('legalDocumentAcknowledgement')
        .selectAll('legalDocumentAcknowledgement')
        .where('userId', '=', userId)
        .execute()

describe('RequireStudyAgreement', () => {
    it('stays out of the way when no agreement has been published', async () => {
        const { study } = await arrangeStudyForCurrentUser()

        renderWithProviders(<RequireStudyAgreement studyId={study.id} />)

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('blocks the study until the agreement is acknowledged, and records the acknowledgement', async () => {
        const { study, user } = await arrangeStudyForCurrentUser()
        const version = await insertTestStudyAgreement({ studyId: study.id })

        renderWithProviders(<RequireStudyAgreement studyId={study.id} />)

        const dialog = await screen.findByRole('dialog')
        expect(dialog).toBeInTheDocument()

        await userEvent.click(screen.getByRole('checkbox'))
        await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

        await waitFor(async () => {
            const acks = await acknowledgementsFor(user.id)
            expect(acks.map((ack) => ack.legalDocumentVersionId)).toEqual([version.id])
        })

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('stays out of the way once acknowledged', async () => {
        const { study } = await arrangeStudyForCurrentUser()
        await insertTestStudyAgreement({ studyId: study.id })

        const { unmount } = renderWithProviders(<RequireStudyAgreement studyId={study.id} />)
        await screen.findByRole('dialog')
        await userEvent.click(screen.getByRole('checkbox'))
        await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        unmount()

        renderWithProviders(<RequireStudyAgreement studyId={study.id} />)
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })
})

describe('StudyAgreementPreparingNotice', () => {
    const renderNotice = (studyId: string, { isVisible = true, tone = 'action' as 'informative' | 'action' } = {}) =>
        renderWithProviders(
            <StudyAgreementPreparingNotice
                studyId={studyId}
                consequence="You cannot submit code"
                isVisible={isVisible}
                tone={tone}
            />,
        )

    it('says an agreement is coming while none is published', async () => {
        const { study } = await arrangeStudyForCurrentUser()

        renderNotice(study.id)

        expect(await screen.findByText(/are being prepared/)).toBeInTheDocument()
    })

    it('names both signatories, lab first, so the reader knows who is holding it up', async () => {
        const { study } = await arrangeStudyForCurrentUser()

        renderNotice(study.id)

        expect(
            await screen.findByText(/You cannot submit code until the required Curious Lab and Partner Enclave/),
        ).toBeInTheDocument()
    })

    it('tells a party they will be notified when theirs is ready', async () => {
        const { study } = await arrangeStudyForCurrentUser()

        renderNotice(study.id)

        expect(await screen.findByText(/you will be notified when your agreement is ready/)).toBeInTheDocument()
    })

    it('drops the notify note in the informative tone', async () => {
        const { study } = await arrangeStudyForCurrentUser()

        renderNotice(study.id, { tone: 'informative' })

        expect(await screen.findByTestId('status-alert')).toHaveAttribute('data-variant', 'informative')
        expect(screen.getByText(/have signed the study agreements\.$/)).toBeInTheDocument()
        expect(screen.queryByText(/you will be notified/)).toBeNull()
    })

    it('goes quiet once an agreement exists, so it cannot contradict the modal', async () => {
        const { study } = await arrangeStudyForCurrentUser()
        await insertTestStudyAgreement({ studyId: study.id })

        renderNotice(study.id)

        await waitFor(() => expect(screen.queryByText(/are being prepared/)).toBeNull())
    })

    // The SI admin who published it must not be told it is still being drawn up.
    it('stays quiet for a non-party, who is never waiting on an agreement', async () => {
        const { study } = await arrangeStudyForCurrentUser()
        await insertTestStudyAgreement({ studyId: study.id })
        await mockSessionWithTestData({ isSiAdmin: true })

        renderNotice(study.id)

        await waitFor(() => expect(screen.queryByText(/are being prepared/)).toBeNull())
    })

    it('renders nothing on the proposal states where no agreement is drawn up', async () => {
        const { study } = await arrangeStudyForCurrentUser({ status: 'PENDING-REVIEW' })

        renderNotice(study.id, { isVisible: false })

        await waitFor(() => expect(screen.queryByText(/are being prepared/)).toBeNull())
    })
})
