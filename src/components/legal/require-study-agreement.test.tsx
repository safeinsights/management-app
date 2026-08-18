import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database'
import type { StudyStatus } from '@/database/types'
import {
    faker,
    insertTestOrg,
    insertTestStudyAgreement,
    insertTestUser,
    mockSessionWithTestData,
    renderWithProviders,
    resetLegalDocuments,
    userEvent,
} from '@/tests/unit.helpers'
import { RequireStudyAgreement } from './require-study-agreement'
import { StudyAgreementPreparingNotice } from './study-agreement-preparing-notice'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/agreement.pdf'),
    }
})

beforeEach(resetLegalDocuments)

// A study on a lab the session user belongs to, so they are a party to its agreement.
const arrangeStudyForCurrentUser = async ({ status = 'APPROVED' as StudyStatus } = {}) => {
    const dataPartner = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
    const researchLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
    const { user: researcher } = await insertTestUser({
        org: { id: researchLab.id, slug: researchLab.slug, type: 'lab' },
    })

    const study = await db
        .insertInto('study')
        .values({
            orgId: dataPartner.id,
            submittedByOrgId: researchLab.id,
            containerLocation: 'test-container',
            title: 'A study',
            researcherId: researcher.id,
            piName: 'test',
            status,
            dataSources: ['all'],
            outputMimeType: 'application/zip',
            language: 'R',
        })
        .returningAll()
        .executeTakeFirstOrThrow()

    const { user } = await mockSessionWithTestData({ orgSlug: researchLab.slug, orgType: 'lab' })
    return { study, user }
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
    it('says an agreement is coming while none is published', async () => {
        const { study } = await arrangeStudyForCurrentUser()

        renderWithProviders(<StudyAgreementPreparingNotice studyId={study.id} isVisible />)

        expect(await screen.findByText(/is being prepared/)).toBeInTheDocument()
    })

    it('goes quiet once an agreement exists, so it cannot contradict the modal', async () => {
        const { study } = await arrangeStudyForCurrentUser()
        await insertTestStudyAgreement({ studyId: study.id })

        renderWithProviders(<StudyAgreementPreparingNotice studyId={study.id} isVisible />)

        await waitFor(() => expect(screen.queryByText(/is being prepared/)).toBeNull())
    })

    it('renders nothing on the proposal states where no agreement is drawn up', async () => {
        const { study } = await arrangeStudyForCurrentUser({ status: 'PENDING-REVIEW' })

        renderWithProviders(<StudyAgreementPreparingNotice studyId={study.id} isVisible={false} />)

        await waitFor(() => expect(screen.queryByText(/is being prepared/)).toBeNull())
    })
})
