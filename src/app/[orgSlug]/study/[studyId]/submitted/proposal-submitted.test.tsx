import { lexicalJson } from '@/lib/lexical'
import { Routes } from '@/lib/routes'
import { getStudyAction, type ProposalFeedbackEntry, type SelectedStudy } from '@/server/actions/study.actions'
import { isSubmittedStudy, type Submitted } from '@/schema/study'
import {
    actionResult,
    insertTestStudyJobData,
    mockClerkSession,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    type Mock,
} from '@/tests/unit.helpers'
import { useParams } from 'next/navigation'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProposalSubmitted } from './proposal-submitted'

const ORG_SLUG = 'test-org'
const ORG_NAME = 'Test Data Partner'

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
        version: overrides.version ?? null,
    }) as ProposalFeedbackEntry

describe('ProposalSubmitted', () => {
    let study: Submitted<SelectedStudy>
    // These tests use `study` as a read-only base (each spreads it into a render); they
    // never mutate the DB row. So seed the org/user/study ONCE in beforeAll (it lives in
    // the outer transaction and survives per-test rollback) instead of paying the seed +
    // insert per test. Only the Clerk mocks — cleared by mockReset between tests — are
    // re-applied per test.
    let mockArgs: Parameters<typeof mockClerkSession>[0]

    beforeAll(async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: ORG_SLUG, orgType: 'enclave' })
        mockArgs = {
            userId: user.id,
            clerkUserId: user.clerkId,
            email: user.email ?? undefined,
            orgSlug: org.slug,
            orgId: org.id,
            orgType: 'enclave',
        }
        const { study: dbStudy } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            title: 'Effect of Reading Comprehension Tools',
        })
        const loaded = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        if (!isSubmittedStudy(loaded)) throw new Error('test fixture must be a submitted study')
        study = loaded
    })

    beforeEach(() => {
        mockClerkSession(mockArgs)
        ;(useParams as Mock).mockReturnValue({ orgSlug: ORG_SLUG, studyId: study.id })
    })

    describe('timestamp and decision label', () => {
        it('displays "Approved on {date}" when status is APPROVED', () => {
            const approvedStudy = {
                ...study,
                status: 'APPROVED' as const,
                submittedAt: new Date('2025-04-16T10:00:00Z'),
                approvedAt: new Date('2026-04-20T10:00:00Z'),
            }
            const entries = [buildEntry({ decision: 'APPROVE', createdAt: new Date('2026-04-16T10:00:00Z') })]
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={approvedStudy}
                    orgName={ORG_NAME}
                    entries={entries}
                    studyVersion={1}
                />,
            )

            expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent('Approved on Apr 20, 2026')
        })

        it('displays "Clarification requested on {date}" when status is CHANGE-REQUESTED', () => {
            const clarificationStudy = {
                ...study,
                status: 'CHANGE-REQUESTED' as const,
                submittedAt: new Date('2025-04-16T10:00:00Z'),
            }
            const entries = [
                buildEntry({ decision: 'NEEDS-CLARIFICATION', createdAt: new Date('2026-04-18T10:00:00Z') }),
            ]
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={clarificationStudy}
                    orgName={ORG_NAME}
                    entries={entries}
                    studyVersion={1}
                />,
            )

            expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent(
                'Clarification requested on Apr 18, 2026',
            )
        })

        it('displays "Rejected on {date}" when status is REJECTED', () => {
            const rejectedStudy = {
                ...study,
                status: 'REJECTED' as const,
                submittedAt: new Date('2025-04-16T10:00:00Z'),
                rejectedAt: new Date('2026-05-01T10:00:00Z'),
            }
            const entries = [buildEntry({ decision: 'REJECT', createdAt: new Date('2026-04-16T10:00:00Z') })]
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={rejectedStudy}
                    orgName={ORG_NAME}
                    entries={entries}
                    studyVersion={1}
                />,
            )

            expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent('Rejected on May 01, 2026')
        })

        it('displays "Submitted on {date}" when status is PENDING-REVIEW', () => {
            const pendingStudy = {
                ...study,
                status: 'PENDING-REVIEW' as const,
                submittedAt: new Date('2025-04-16T10:00:00Z'),
            }
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={pendingStudy}
                    orgName={ORG_NAME}
                    entries={[]}
                    studyVersion={1}
                />,
            )

            expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent('Submitted on Apr 16, 2025')
        })

        it('displays "Resubmitted on {date}" when status is PENDING-REVIEW after a resubmission', () => {
            const pendingStudy = {
                ...study,
                status: 'PENDING-REVIEW' as const,
                submittedAt: new Date('2025-04-16T10:00:00Z'),
            }
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={pendingStudy}
                    orgName={ORG_NAME}
                    entries={[]}
                    studyVersion={2}
                />,
            )

            expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent('Resubmitted on Apr 16, 2025')
        })

        it('formats the date as MMM DD, YYYY', () => {
            const approvedStudy = {
                ...study,
                status: 'APPROVED' as const,
                submittedAt: new Date('2025-04-16T10:00:00Z'),
                approvedAt: new Date('2025-12-01T10:00:00Z'),
            }
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={approvedStudy}
                    orgName={ORG_NAME}
                    entries={[]}
                    studyVersion={1}
                />,
            )

            expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent('Approved on Dec 01, 2025')
        })

        it('renders the timestamp above the divider', () => {
            const approvedStudy = {
                ...study,
                status: 'APPROVED' as const,
                submittedAt: new Date('2025-04-16'),
                approvedAt: new Date('2026-04-20T10:00:00Z'),
            }
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={approvedStudy}
                    orgName={ORG_NAME}
                    entries={[]}
                    studyVersion={1}
                />,
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
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={approvedStudy}
                    orgName={ORG_NAME}
                    entries={[]}
                    studyVersion={1}
                />,
            )

            const banner = screen.getByTestId('status-banner-APPROVED')
            expect(banner).toHaveTextContent(
                `${ORG_NAME} has reviewed and approved your initial request. Review their feedback below, then proceed to Step 3 - Agreements to sign the required legal documents.`,
            )
        })

        it('renders a blue banner with clarification copy when status is CHANGE-REQUESTED', () => {
            const clarificationStudy = { ...study, status: 'CHANGE-REQUESTED' as const }
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={clarificationStudy}
                    orgName={ORG_NAME}
                    entries={[]}
                    studyVersion={1}
                />,
            )

            const banner = screen.getByTestId('status-banner-CHANGE-REQUESTED')
            expect(banner).toHaveTextContent(
                `${ORG_NAME} has reviewed your initial request and has requested clarifications. Please review their feedback below. You can revise and resubmit your request to address their questions.`,
            )
        })

        it('renders a red banner with rejected copy when status is REJECTED', () => {
            const rejectedStudy = { ...study, status: 'REJECTED' as const }
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={rejectedStudy}
                    orgName={ORG_NAME}
                    entries={[]}
                    studyVersion={1}
                />,
            )

            const banner = screen.getByTestId('status-banner-REJECTED')
            expect(banner).toHaveTextContent(
                `${ORG_NAME} has reviewed your initial request and is unable to support it at this time. Please review their feedback below for more details.`,
            )
        })

        it('renders the banner below the divider', () => {
            const approvedStudy = { ...study, status: 'APPROVED' as const }
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={approvedStudy}
                    orgName={ORG_NAME}
                    entries={[]}
                    studyVersion={1}
                />,
            )

            const divider = screen.getByTestId('proposal-header-divider')
            const banner = screen.getByTestId('status-banner-APPROVED')
            expect(divider.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        })

        it('renders only one banner at a time', () => {
            const approvedStudy = { ...study, status: 'APPROVED' as const }
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={approvedStudy}
                    orgName={ORG_NAME}
                    entries={[]}
                    studyVersion={1}
                />,
            )

            expect(screen.getByTestId('status-banner-APPROVED')).toBeInTheDocument()
            expect(screen.queryByTestId('status-banner-REJECTED')).not.toBeInTheDocument()
            expect(screen.queryByTestId('status-banner-CHANGE-REQUESTED')).not.toBeInTheDocument()
            expect(screen.queryByTestId('status-banner-PENDING-REVIEW')).not.toBeInTheDocument()
        })

        it('renders resubmission copy when status is PENDING-REVIEW after a resubmission', () => {
            const pendingStudy = { ...study, status: 'PENDING-REVIEW' as const }
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={pendingStudy}
                    orgName={ORG_NAME}
                    entries={[]}
                    studyVersion={2}
                />,
            )

            const banner = screen.getByTestId('status-banner-PENDING-REVIEW')
            expect(banner).toHaveTextContent(
                `Your revised initial request has been resubmitted to ${ORG_NAME}. They will review your changes and respond with feedback or a decision. You'll receive email notifications as your request progresses through the review process.`,
            )
        })
    })

    describe('view full initial request dropdown', () => {
        it('is collapsed by default on page load', () => {
            renderWithProviders(
                <ProposalSubmitted orgSlug={ORG_SLUG} study={study} orgName={ORG_NAME} entries={[]} studyVersion={1} />,
            )

            expect(screen.getByTestId('proposal-toggle-header')).toHaveTextContent('View full initial request')
            expect(screen.queryByTestId('proposal-body')).not.toBeVisible()
        })

        it('expands to display the study proposal when clicked', async () => {
            const user = userEvent.setup()
            renderWithProviders(
                <ProposalSubmitted orgSlug={ORG_SLUG} study={study} orgName={ORG_NAME} entries={[]} studyVersion={1} />,
            )

            await user.click(screen.getByTestId('proposal-toggle-header'))

            expect(screen.getByTestId('proposal-toggle-header')).toHaveTextContent('Hide full initial request')
            expect(screen.getByTestId('proposal-body')).toBeVisible()
            expect(screen.getByText(`Title: ${study.title}`)).toBeInTheDocument()
        })

        it('displays study proposal content as read-only with no editable fields', async () => {
            const user = userEvent.setup()
            renderWithProviders(
                <ProposalSubmitted orgSlug={ORG_SLUG} study={study} orgName={ORG_NAME} entries={[]} studyVersion={1} />,
            )

            await user.click(screen.getByTestId('proposal-toggle-header'))

            const body = screen.getByTestId('proposal-body')
            const inputs = body.querySelectorAll('input, textarea, select, [contenteditable="true"]')
            expect(inputs).toHaveLength(0)
        })
    })

    describe('navigation', () => {
        it('shows a "Back" button linking to dashboard when status is APPROVED', () => {
            const approvedStudy = { ...study, status: 'APPROVED' as const }
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={approvedStudy}
                    orgName={ORG_NAME}
                    entries={[]}
                    studyVersion={1}
                />,
            )

            const backLink = screen.getByRole('link', { name: /back/i })
            expect(backLink).toHaveAttribute('href', '/dashboard')
        })

        it('shows a "Proceed to step 3" button linking to agreements when status is APPROVED', () => {
            const approvedStudy = { ...study, status: 'APPROVED' as const }
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={approvedStudy}
                    orgName={ORG_NAME}
                    entries={[]}
                    studyVersion={1}
                />,
            )

            const proceedLink = screen.getByRole('link', { name: /proceed to step 3/i })
            expect(proceedLink).toHaveAttribute(
                'href',
                Routes.studyResearcherAgreements({ orgSlug: ORG_SLUG, studyId: study.id }),
            )
        })

        it('shows a "Back" button linking to dashboard when status is CHANGE-REQUESTED', () => {
            const clarificationStudy = { ...study, status: 'CHANGE-REQUESTED' as const }
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={clarificationStudy}
                    orgName={ORG_NAME}
                    entries={[]}
                    studyVersion={1}
                />,
            )

            const backLink = screen.getByRole('link', { name: /back/i })
            expect(backLink).toHaveAttribute('href', '/dashboard')
        })

        it('shows an "Edit and resubmit" button linking to edit and resubmit page when status is CHANGE-REQUESTED', () => {
            const clarificationStudy = { ...study, status: 'CHANGE-REQUESTED' as const }
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={clarificationStudy}
                    orgName={ORG_NAME}
                    entries={[]}
                    studyVersion={1}
                />,
            )

            const editLink = screen.getByRole('link', { name: /edit and resubmit/i })
            expect(editLink).toHaveAttribute('href', `/${ORG_SLUG}/study/${study.id}/edit-and-resubmit`)
        })

        it('shows a "Go to dashboard" button linking to dashboard when status is REJECTED', () => {
            const rejectedStudy = { ...study, status: 'REJECTED' as const }
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={rejectedStudy}
                    orgName={ORG_NAME}
                    entries={[]}
                    studyVersion={1}
                />,
            )

            const dashboardLink = screen.getByRole('link', { name: /go to dashboard/i })
            expect(dashboardLink).toHaveAttribute('href', '/dashboard')
        })
    })

    describe('section heading iteration label', () => {
        it('displays "Initial request" on first submission', () => {
            renderWithProviders(
                <ProposalSubmitted orgSlug={ORG_SLUG} study={study} orgName={ORG_NAME} entries={[]} studyVersion={1} />,
            )

            expect(screen.getByTestId('proposal-section-header')).toHaveTextContent('Initial request')
        })

        it('displays "Initial request 2.0" after the first resubmission', () => {
            renderWithProviders(
                <ProposalSubmitted orgSlug={ORG_SLUG} study={study} orgName={ORG_NAME} entries={[]} studyVersion={2} />,
            )

            expect(screen.getByTestId('proposal-section-header')).toHaveTextContent('Initial request 2.0')
        })

        it('displays "Initial request 3.0" after the second resubmission', () => {
            renderWithProviders(
                <ProposalSubmitted orgSlug={ORG_SLUG} study={study} orgName={ORG_NAME} entries={[]} studyVersion={3} />,
            )

            expect(screen.getByTestId('proposal-section-header')).toHaveTextContent('Initial request 3.0')
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
            version: 2,
        })

        const researcherEntry = buildEntry({
            id: 'researcher-1',
            authorRole: 'RESEARCHER',
            entryType: 'RESUBMISSION-NOTE',
            authorName: 'Dr. Researcher',
            decision: null,
            createdAt: new Date('2026-04-18T08:00:00Z'),
            body: JSON.parse(lexicalJson('Original resubmission note.')),
            version: 2,
        })

        it('displays entries from most recent to oldest', () => {
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={study}
                    orgName={ORG_NAME}
                    entries={[reviewerEntry, researcherEntry]}
                    studyVersion={2}
                />,
            )

            const entries = screen.getByTestId('feedback-entries')
            const rendered = entries.querySelectorAll('[data-testid^="feedback-entry-"]')
            expect(rendered[0]).toHaveAttribute('data-testid', 'feedback-entry-reviewer-1')
            expect(rendered[1]).toHaveAttribute('data-testid', 'feedback-entry-researcher-1')
        })

        it('titles reviewer entries "Reviewer feedback (v1.0)" for first submission', () => {
            const v1ReviewerEntry = buildEntry({
                ...reviewerEntry,
                version: 1,
            })
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={study}
                    orgName={ORG_NAME}
                    entries={[v1ReviewerEntry]}
                    studyVersion={1}
                />,
            )

            expect(screen.getByTestId('feedback-entry-reviewer-1')).toHaveTextContent('Reviewer feedback (v1.0)')
        })

        it('titles entries with their stored version', () => {
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={study}
                    orgName={ORG_NAME}
                    entries={[reviewerEntry, researcherEntry]}
                    studyVersion={2}
                />,
            )

            expect(screen.getByTestId('feedback-entry-reviewer-1')).toHaveTextContent('Reviewer feedback (v2.0)')
            expect(screen.getByTestId('feedback-entry-researcher-1')).toHaveTextContent('Resubmission note (v2.0)')
        })

        it('displays the reviewer name on reviewer feedback entries', () => {
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={study}
                    orgName={ORG_NAME}
                    entries={[reviewerEntry]}
                    studyVersion={1}
                />,
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
                    studyVersion={2}
                />,
            )

            expect(screen.getByTestId('feedback-entry-researcher-1')).toHaveTextContent('Dr. Researcher')
        })

        it('displays the date the reviewer submitted their decision', () => {
            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={study}
                    orgName={ORG_NAME}
                    entries={[reviewerEntry]}
                    studyVersion={1}
                />,
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
                    studyVersion={2}
                />,
            )

            expect(screen.getByTestId('feedback-entry-researcher-1')).toHaveTextContent('Apr 18, 2026')
        })

        it('expands the latest entry by default', () => {
            const scrollHeightSpy = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000)
            try {
                renderWithProviders(
                    <ProposalSubmitted
                        orgSlug={ORG_SLUG}
                        study={study}
                        orgName={ORG_NAME}
                        entries={[reviewerEntry, researcherEntry]}
                        studyVersion={2}
                    />,
                )

                expect(screen.getByTestId('feedback-toggle-reviewer-1')).toHaveAttribute('aria-expanded', 'true')
            } finally {
                scrollHeightSpy.mockRestore()
            }
        })

        it('collapses older entries by default', () => {
            const scrollHeightSpy = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000)
            try {
                renderWithProviders(
                    <ProposalSubmitted
                        orgSlug={ORG_SLUG}
                        study={study}
                        orgName={ORG_NAME}
                        entries={[reviewerEntry, researcherEntry]}
                        studyVersion={2}
                    />,
                )

                expect(screen.getByTestId('feedback-toggle-researcher-1')).toHaveAttribute('aria-expanded', 'false')
            } finally {
                scrollHeightSpy.mockRestore()
            }
        })

        it('collapses resubmission notes by default even when latest', () => {
            const scrollHeightSpy = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000)
            try {
                renderWithProviders(
                    <ProposalSubmitted
                        orgSlug={ORG_SLUG}
                        study={study}
                        orgName={ORG_NAME}
                        entries={[researcherEntry, reviewerEntry]}
                        studyVersion={2}
                    />,
                )

                expect(screen.getByTestId('feedback-toggle-researcher-1')).toHaveAttribute('aria-expanded', 'false')
            } finally {
                scrollHeightSpy.mockRestore()
            }
        })

        it('labels multiple resubmission notes with ascending versions', () => {
            const secondResub = buildEntry({
                id: 'researcher-2',
                authorRole: 'RESEARCHER',
                entryType: 'RESUBMISSION-NOTE',
                authorName: 'Dr. Researcher',
                decision: null,
                createdAt: new Date('2026-04-25T08:00:00Z'),
                body: JSON.parse(lexicalJson('Second resubmission note.')),
                version: 3,
            })

            renderWithProviders(
                <ProposalSubmitted
                    orgSlug={ORG_SLUG}
                    study={study}
                    orgName={ORG_NAME}
                    entries={[secondResub, reviewerEntry, researcherEntry]}
                    studyVersion={3}
                />,
            )

            expect(screen.getByTestId('feedback-entry-researcher-2')).toHaveTextContent('Resubmission note (v3.0)')
            expect(screen.getByTestId('feedback-entry-researcher-1')).toHaveTextContent('Resubmission note (v2.0)')
        })
    })
})
