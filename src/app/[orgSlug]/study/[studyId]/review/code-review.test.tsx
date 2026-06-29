import { lexicalJson } from '@/lib/lexical'
import { type CodeReviewFeedbackEntry, getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import { isSubmittedStudy, type Submitted } from '@/schema/study'
import {
    actionResult,
    db,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    type Mock,
} from '@/tests/unit.helpers'
import dayjs from 'dayjs'
import { useParams } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CodeReview } from './code-review'

// The global setup mocks @/components/page-breadcrumbs to return null; opt back into
// the real component here so we can assert the rendered breadcrumb links.
vi.unmock('@/components/page-breadcrumbs')

const ORG_SLUG = 'test-org'

const ROUND_1_DATE = new Date('2026-04-02T10:00:00Z')
const ROUND_2_DATE = new Date('2026-04-06T10:00:00Z')

const buildEntry = (overrides: Partial<CodeReviewFeedbackEntry> = {}): CodeReviewFeedbackEntry =>
    ({
        id: overrides.id ?? 'code-entry-1',
        authorId: overrides.authorId ?? 'author-1',
        authorName: overrides.authorName ?? 'Reviewer One',
        entryType: overrides.entryType ?? 'REVIEWER-FEEDBACK',
        decision: overrides.decision === undefined ? 'NEEDS-CLARIFICATION' : overrides.decision,
        body: overrides.body ?? JSON.parse(lexicalJson('Reviewer comments go here.')),
        criteria: overrides.criteria ?? null,
        createdAt: overrides.createdAt ?? ROUND_1_DATE,
        version: overrides.version ?? 1,
    }) as CodeReviewFeedbackEntry

describe('CodeReview', () => {
    let study: Submitted<SelectedStudy>
    let jobCreatedAt: Date

    beforeEach(async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: ORG_SLUG, orgType: 'enclave' })
        const { study: dbStudy, latestJobWithStatus } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
            title: 'Effect of Reading Comprehension Tools',
        })
        const loaded = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        if (!isSubmittedStudy(loaded)) throw new Error('test fixture must be a submitted study')
        study = loaded
        jobCreatedAt = latestJobWithStatus.createdAt
        ;(useParams as Mock).mockReturnValue({ orgSlug: ORG_SLUG, studyId: study.id })
    })

    describe('first submission (entries empty)', () => {
        it('renders the H1 page title "Study Proposal"', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: [] }))

            expect(screen.getByRole('heading', { name: 'Study Proposal', level: 1 })).toBeInTheDocument()
        })

        it('renders all three breadcrumbs with the expected links', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: [] }))

            const dashboardLink = screen.getByRole('link', { name: 'Dashboard' })
            expect(dashboardLink).toHaveAttribute('href', `/${ORG_SLUG}/dashboard`)

            const proposalLink = screen.getByRole('link', { name: 'Study proposal' })
            expect(proposalLink).toHaveAttribute('href', `/${ORG_SLUG}/study/${study.id}/review/proposal`)

            // "Study code" is the terminal crumb and should not be a link
            expect(screen.getByText('Study code')).toBeInTheDocument()
            expect(screen.queryByRole('link', { name: 'Study code' })).not.toBeInTheDocument()
        })

        it('renders the STEP 3 sub-label and the section heading', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: [] }))

            expect(screen.getByText('STEP 3')).toBeInTheDocument()
            expect(screen.getByRole('heading', { name: 'Review study code', level: 4 })).toBeInTheDocument()
        })

        it('renders the study title in the section header', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: [] }))

            expect(screen.getByText(/Title: Effect of Reading Comprehension Tools/)).toBeInTheDocument()
        })

        it('renders "Submitted on {date}" formatted from the latest job createdAt', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: [] }))

            const formatted = dayjs(jobCreatedAt).format('MMM DD, YYYY')
            expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent(`Submitted on ${formatted}`)
        })

        it('renders the status banner with the first-submission intro copy', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: [] }))

            const banner = screen.getByTestId('code-review-status-banner')
            expect(banner).toBeInTheDocument()
            const labName = study.submittingLabName ?? study.submittedByOrgSlug
            expect(banner).toHaveTextContent(labName)
            expect(banner).toHaveTextContent(
                'has submitted their study code for review. Below, you will review their code and an AI-generated summary of its behavior, then share your feedback and decision. Consider evaluating the code based on these criteria:',
            )
            expect(banner).not.toHaveTextContent('has resubmitted')

            // The lab name should not be wrapped in <strong> / fw=700
            const strongs = banner.querySelectorAll('strong')
            for (const strong of strongs) {
                expect(strong.textContent ?? '').not.toContain(labName)
            }
        })

        it('renders all four review criteria', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: [] }))

            const criteria = screen.getByTestId('code-review-criteria')
            expect(criteria).toHaveTextContent(
                'Proposal alignment: Does the code align with the approved research proposal?',
            )
            expect(criteria).toHaveTextContent('Agreement compliance: Does the code comply with all the agreements?')
            expect(criteria).toHaveTextContent('Security checks: Have security and vulnerability checks been passed?')
            expect(criteria).toHaveTextContent(
                'Privacy protection: Is there any risk of PII exposure expected in the outputs?',
            )
        })

        it('does not render a Feedback and notes section', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: [] }))

            expect(screen.queryByTestId('feedback-and-notes-section')).not.toBeInTheDocument()
        })
    })

    describe('resubmission (prior entries present)', () => {
        // A resubmission means the current job is round v2: the prior round's reviewer
        // decision plus the current round's RL note both surface as feedback entries.
        const reviewerEntry = buildEntry({
            id: 'reviewer-v1',
            authorName: 'Jessica Walters',
            entryType: 'REVIEWER-FEEDBACK',
            decision: 'NEEDS-CLARIFICATION',
            createdAt: ROUND_1_DATE,
            version: 1,
        })
        const resubmissionNote = buildEntry({
            id: 'note-v2',
            authorName: 'Debshilla Basu Mallick',
            entryType: 'RESUBMISSION-NOTE',
            decision: null,
            body: JSON.parse(lexicalJson('All feedback has been reviewed and addressed.')),
            criteria: null,
            createdAt: ROUND_2_DATE,
            version: 2,
        })
        // Action returns newest first (createdAt desc).
        const resubmissionEntries: CodeReviewFeedbackEntry[] = [resubmissionNote, reviewerEntry]

        it('renders "Resubmitted on {date}" in place of "Submitted on"', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: resubmissionEntries }))

            const formatted = dayjs(jobCreatedAt).format('MMM DD, YYYY')
            expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent(`Resubmitted on ${formatted}`)
            expect(screen.getByTestId('proposal-timestamp')).not.toHaveTextContent('Submitted on')
        })

        it('renders the resubmission banner copy', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: resubmissionEntries }))

            const banner = screen.getByTestId('code-review-status-banner')
            const labName = study.submittingLabName ?? study.submittedByOrgSlug
            expect(banner).toHaveTextContent(labName)
            expect(banner).toHaveTextContent(
                'has resubmitted their study code for review. Below, you will review their code and an AI-generated summary of its behavior, then share your feedback and decision. Consider evaluating the code based on these criteria:',
            )
        })

        it('reflects the resubmission version in the section heading', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: resubmissionEntries }))

            expect(screen.getByRole('heading', { name: 'Review study code v2.0', level: 4 })).toBeInTheDocument()
            expect(screen.queryByRole('heading', { name: 'Review study code', level: 4 })).not.toBeInTheDocument()
        })

        it('renders a Feedback and notes section showing both prior and current entries', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: resubmissionEntries }))

            const section = screen.getByTestId('feedback-and-notes-section')
            expect(section).toBeInTheDocument()
            expect(section).toHaveTextContent('Reviewer feedback (v1.0)')
            expect(section).toHaveTextContent('Resubmission note (v2.0)')
            expect(section).toHaveTextContent('Jessica Walters')
            expect(section).toHaveTextContent('Debshilla Basu Mallick')
        })

        it('positions the Feedback and notes section above the code evaluation form', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: resubmissionEntries }))

            const feedback = screen.getByTestId('feedback-and-notes-section')
            const submittedCode = screen.getByTestId('submitted-code-section')
            // DOM order: submitted code → feedback and notes → (evaluation form lives inside CodeReviewClient)
            expect(submittedCode.compareDocumentPosition(feedback) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        })

        it('collapses the submitted code viewer by default on resubmission', async () => {
            // Insert a code file so StudyCodeViewer renders the toggle (hidden when files is empty).
            // The toggle visibility plus its label is what proves the "collapsed by default" AC.
            const job = await db
                .selectFrom('studyJob')
                .select('id')
                .where('studyId', '=', study.id)
                .orderBy('createdAt', 'desc')
                .executeTakeFirstOrThrow()
            await db
                .insertInto('studyJobFile')
                .values({
                    studyJobId: job.id,
                    name: 'main.R',
                    path: `${study.submittedByOrgSlug}/${study.id}/${job.id}/main.R`,
                    fileType: 'MAIN-CODE',
                })
                .execute()

            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: resubmissionEntries }))

            const toggle = screen.getByTestId('study-code-toggle')
            expect(toggle).toHaveAttribute('aria-expanded', 'false')
            expect(toggle).toHaveTextContent('View full study code')
            // Body must remain hidden until the user expands.
            expect(screen.queryByTestId('study-code-body')).not.toBeInTheDocument()
            expect(screen.queryByTestId('study-code-body-loading')).not.toBeInTheDocument()
        })
    })
})
