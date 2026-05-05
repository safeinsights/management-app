import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import {
    actionResult,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    type Mock,
} from '@/tests/unit.helpers'
import { useParams } from 'next/navigation'
import { beforeEach, describe, expect, it } from 'vitest'
import { ProposalSubmitted } from './proposal-submitted'

const ORG_SLUG = 'test-org'
const ORG_NAME = 'Test Data Organization'

describe('ProposalSubmitted', () => {
    let study: SelectedStudy

    beforeEach(async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: ORG_SLUG, orgType: 'enclave' })
        const { study: dbStudy } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            title: 'Effect of Reading Comprehension Tools',
        })
        study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        ;(useParams as Mock).mockReturnValue({ orgSlug: ORG_SLUG, studyId: study.id })
    })

    describe('timestamp and decision label', () => {
        it('displays "Approved on {date}" when status is APPROVED', () => {
            const approvedStudy = {
                ...study,
                status: 'APPROVED' as const,
                submittedAt: new Date('2025-04-16T10:00:00Z'),
            }
            renderWithProviders(
                <ProposalSubmitted orgSlug={ORG_SLUG} study={approvedStudy} orgName={ORG_NAME} entries={[]} />,
            )

            expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent('Approved on Apr 16, 2025')
        })

        it('displays "Clarification requested on {date}" when status is CHANGE-REQUESTED', () => {
            const clarificationStudy = {
                ...study,
                status: 'CHANGE-REQUESTED' as const,
                submittedAt: new Date('2025-04-16T10:00:00Z'),
            }
            renderWithProviders(
                <ProposalSubmitted orgSlug={ORG_SLUG} study={clarificationStudy} orgName={ORG_NAME} entries={[]} />,
            )

            expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent(
                'Clarification requested on Apr 16, 2025',
            )
        })

        it('displays "Rejected on {date}" when status is REJECTED', () => {
            const rejectedStudy = {
                ...study,
                status: 'REJECTED' as const,
                submittedAt: new Date('2025-04-16T10:00:00Z'),
            }
            renderWithProviders(
                <ProposalSubmitted orgSlug={ORG_SLUG} study={rejectedStudy} orgName={ORG_NAME} entries={[]} />,
            )

            expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent('Rejected on Apr 16, 2025')
        })

        it('displays "Submitted on {date}" when status is PENDING-REVIEW', () => {
            const pendingStudy = {
                ...study,
                status: 'PENDING-REVIEW' as const,
                submittedAt: new Date('2025-04-16T10:00:00Z'),
            }
            renderWithProviders(
                <ProposalSubmitted orgSlug={ORG_SLUG} study={pendingStudy} orgName={ORG_NAME} entries={[]} />,
            )

            expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent('Submitted on Apr 16, 2025')
        })

        it('formats the date as MMM DD, YYYY', () => {
            const approvedStudy = {
                ...study,
                status: 'APPROVED' as const,
                submittedAt: new Date('2025-12-01T10:00:00Z'),
            }
            renderWithProviders(
                <ProposalSubmitted orgSlug={ORG_SLUG} study={approvedStudy} orgName={ORG_NAME} entries={[]} />,
            )

            expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent('Approved on Dec 01, 2025')
        })

        it('renders the timestamp above the divider', () => {
            const approvedStudy = { ...study, status: 'APPROVED' as const, submittedAt: new Date('2025-04-16') }
            renderWithProviders(
                <ProposalSubmitted orgSlug={ORG_SLUG} study={approvedStudy} orgName={ORG_NAME} entries={[]} />,
            )

            const timestamp = screen.getByTestId('proposal-timestamp')
            const divider = screen.getByTestId('proposal-header-divider')
            expect(timestamp.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        })
    })

    describe('decision banner', () => {
        it('renders a green banner with approved copy when status is APPROVED', () => {
            const approvedStudy = { ...study, status: 'APPROVED' as const }
            renderWithProviders(
                <ProposalSubmitted orgSlug={ORG_SLUG} study={approvedStudy} orgName={ORG_NAME} entries={[]} />,
            )

            const banner = screen.getByTestId('status-banner-APPROVED')
            expect(banner).toHaveTextContent(
                `${ORG_NAME} has reviewed and approved your initial request. Review their feedback below, then proceed to Step 3 - Agreements to sign the required legal documents.`,
            )
        })

        it('renders a blue banner with clarification copy when status is CHANGE-REQUESTED', () => {
            const clarificationStudy = { ...study, status: 'CHANGE-REQUESTED' as const }
            renderWithProviders(
                <ProposalSubmitted orgSlug={ORG_SLUG} study={clarificationStudy} orgName={ORG_NAME} entries={[]} />,
            )

            const banner = screen.getByTestId('status-banner-CHANGE-REQUESTED')
            expect(banner).toHaveTextContent(
                `${ORG_NAME} has reviewed your initial request and has requested clarifications. Please review their feedback below. You can revise and resubmit your request to address their questions.`,
            )
        })

        it('renders a red banner with rejected copy when status is REJECTED', () => {
            const rejectedStudy = { ...study, status: 'REJECTED' as const }
            renderWithProviders(
                <ProposalSubmitted orgSlug={ORG_SLUG} study={rejectedStudy} orgName={ORG_NAME} entries={[]} />,
            )

            const banner = screen.getByTestId('status-banner-REJECTED')
            expect(banner).toHaveTextContent(
                `${ORG_NAME} has reviewed your initial request and is unable to support it at this time. Please review their feedback below for more details.`,
            )
        })

        it('renders the banner below the divider', () => {
            const approvedStudy = { ...study, status: 'APPROVED' as const }
            renderWithProviders(
                <ProposalSubmitted orgSlug={ORG_SLUG} study={approvedStudy} orgName={ORG_NAME} entries={[]} />,
            )

            const divider = screen.getByTestId('proposal-header-divider')
            const banner = screen.getByTestId('status-banner-APPROVED')
            expect(divider.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        })

        it('renders only one banner at a time', () => {
            const approvedStudy = { ...study, status: 'APPROVED' as const }
            renderWithProviders(
                <ProposalSubmitted orgSlug={ORG_SLUG} study={approvedStudy} orgName={ORG_NAME} entries={[]} />,
            )

            expect(screen.getByTestId('status-banner-APPROVED')).toBeInTheDocument()
            expect(screen.queryByTestId('status-banner-REJECTED')).not.toBeInTheDocument()
            expect(screen.queryByTestId('status-banner-CHANGE-REQUESTED')).not.toBeInTheDocument()
            expect(screen.queryByTestId('status-banner-PENDING-REVIEW')).not.toBeInTheDocument()
        })
    })
})
