import { lexicalJson } from '@/lib/word-count'
import { getStudyAction, type ProposalFeedbackEntry, type SelectedStudy } from '@/server/actions/study.actions'
import {
    actionResult,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    type Mock,
} from '@/tests/unit.helpers'
import { useParams } from 'next/navigation'
import { beforeEach, describe, expect, it } from 'vitest'
import { ProposalSubmitted } from './proposal-submitted'

const ORG_SLUG = 'test-org'
const ORG_NAME = 'Test Data Organization'

const buildEntry = (overrides: Partial<ProposalFeedbackEntry> = {}): ProposalFeedbackEntry =>
    ({
        id: overrides.id ?? 'entry-1',
        authorId: overrides.authorId ?? 'author-1',
        authorName: overrides.authorName ?? 'Reviewer One',
        authorRole: overrides.authorRole ?? 'REVIEWER',
        entryType: overrides.entryType ?? 'REVIEWER-FEEDBACK',
        decision: overrides.decision === undefined ? 'APPROVE' : overrides.decision,
        body: overrides.body ?? JSON.parse(lexicalJson('Feedback body text.')),
        createdAt: overrides.createdAt ?? new Date('2026-04-20T12:00:00Z'),
    }) as ProposalFeedbackEntry

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

    describe('view full initial request dropdown', () => {
        it('is collapsed by default on page load', () => {
            renderWithProviders(<ProposalSubmitted orgSlug={ORG_SLUG} study={study} orgName={ORG_NAME} entries={[]} />)

            expect(screen.getByTestId('proposal-toggle-header')).toHaveTextContent('View full initial request')
            expect(screen.queryByTestId('proposal-body')).not.toBeVisible()
        })

        it('expands to display the study proposal when clicked', async () => {
            const user = userEvent.setup()
            renderWithProviders(<ProposalSubmitted orgSlug={ORG_SLUG} study={study} orgName={ORG_NAME} entries={[]} />)

            await user.click(screen.getByTestId('proposal-toggle-header'))

            expect(screen.getByTestId('proposal-toggle-header')).toHaveTextContent('Hide full initial request')
            expect(screen.getByTestId('proposal-body')).toBeVisible()
            expect(screen.getByText(`Title: ${study.title}`)).toBeInTheDocument()
        })

        it('displays study proposal content as read-only with no editable fields', async () => {
            const user = userEvent.setup()
            renderWithProviders(<ProposalSubmitted orgSlug={ORG_SLUG} study={study} orgName={ORG_NAME} entries={[]} />)

            await user.click(screen.getByTestId('proposal-toggle-header'))

            const body = screen.getByTestId('proposal-body')
            const inputs = body.querySelectorAll('input, textarea, select, [contenteditable="true"]')
            expect(inputs).toHaveLength(0)
        })
    })

    describe('feedback and notes', () => {
        const reviewerEntry = buildEntry({
            id: 'reviewer-1',
            authorRole: 'REVIEWER',
            entryType: 'REVIEWER-FEEDBACK',
            authorName: 'Dr. Reviewer',
            decision: 'NEEDS-CLARIFICATION',
            createdAt: new Date('2026-04-20T12:00:00Z'),
            body: JSON.parse(lexicalJson('Latest reviewer note.')),
        })

        const researcherEntry = buildEntry({
            id: 'researcher-1',
            authorRole: 'RESEARCHER',
            entryType: 'RESUBMISSION-NOTE',
            authorName: 'Dr. Researcher',
            decision: null,
            createdAt: new Date('2026-04-18T08:00:00Z'),
            body: JSON.parse(lexicalJson('Original resubmission note.')),
        })

        it('displays entries from most recent to oldest', () => {
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={study}
                    orgName={ORG_NAME}
                    entries={[reviewerEntry, researcherEntry]}
                />,
            )

            const entries = screen.getByTestId('feedback-entries')
            const rendered = entries.querySelectorAll('[data-testid^="feedback-entry-"]')
            expect(rendered[0]).toHaveAttribute('data-testid', 'feedback-entry-reviewer-1')
            expect(rendered[1]).toHaveAttribute('data-testid', 'feedback-entry-researcher-1')
        })

        it('titles reviewer entries "Reviewer feedback"', () => {
            renderWithProviders(
                <ProposalSubmitted orgSlug={ORG_SLUG} study={study} orgName={ORG_NAME} entries={[reviewerEntry]} />,
            )

            expect(screen.getByTestId('feedback-entry-reviewer-1')).toHaveTextContent('Reviewer feedback')
        })

        it('titles researcher entries "Resubmission note"', () => {
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={study}
                    orgName={ORG_NAME}
                    entries={[reviewerEntry, researcherEntry]}
                />,
            )

            expect(screen.getByTestId('feedback-entry-researcher-1')).toHaveTextContent('Resubmission note')
        })

        it('displays the reviewer name on reviewer feedback entries', () => {
            renderWithProviders(
                <ProposalSubmitted orgSlug={ORG_SLUG} study={study} orgName={ORG_NAME} entries={[reviewerEntry]} />,
            )

            expect(screen.getByTestId('feedback-entry-reviewer-1')).toHaveTextContent('Dr. Reviewer')
        })

        it('displays the researcher name on resubmission note entries', () => {
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={study}
                    orgName={ORG_NAME}
                    entries={[reviewerEntry, researcherEntry]}
                />,
            )

            expect(screen.getByTestId('feedback-entry-researcher-1')).toHaveTextContent('Dr. Researcher')
        })

        it('displays the date the reviewer submitted their decision', () => {
            renderWithProviders(
                <ProposalSubmitted orgSlug={ORG_SLUG} study={study} orgName={ORG_NAME} entries={[reviewerEntry]} />,
            )

            expect(screen.getByTestId('feedback-entry-reviewer-1')).toHaveTextContent('Apr 20, 2026')
        })

        it('displays the date the researcher submitted proposal changes', () => {
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={study}
                    orgName={ORG_NAME}
                    entries={[reviewerEntry, researcherEntry]}
                />,
            )

            expect(screen.getByTestId('feedback-entry-researcher-1')).toHaveTextContent('Apr 18, 2026')
        })

        it('expands the latest entry by default', () => {
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={study}
                    orgName={ORG_NAME}
                    entries={[reviewerEntry, researcherEntry]}
                />,
            )

            expect(screen.getByTestId('feedback-toggle-reviewer-1')).toHaveAttribute('aria-expanded', 'true')
        })

        it('collapses older entries by default', () => {
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={study}
                    orgName={ORG_NAME}
                    entries={[reviewerEntry, researcherEntry]}
                />,
            )

            expect(screen.getByTestId('feedback-toggle-researcher-1')).toHaveAttribute('aria-expanded', 'false')
        })
    })
})
