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
    userEvent,
    waitFor,
} from '@/tests/unit.helpers'
import dayjs from 'dayjs'
import { useParams } from 'next/navigation'
import { beforeEach, describe, expect, it } from 'vitest'
import { STATUS_ALERT_SEPARATOR } from '@/components/study/status-alert'
import { CodeReview } from './code-review'

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
        it('renders the H1 page title "Study proposal"', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: [] }))

            expect(screen.getByRole('heading', { level: 1, name: study.title! })).toBeInTheDocument()
        })

        it('renders the STEP 3 sub-label and the section heading', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: [] }))

            expect(screen.getByText('STEP 3')).toBeInTheDocument()
            expect(screen.getByRole('heading', { name: 'Review study code', level: 2 })).toBeInTheDocument()
        })

        it('does not render the study title in the section header', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: [] }))

            expect(screen.getByTestId('proposal-section-header')).not.toHaveTextContent(study.title!)
        })

        it('dates the banner title from the latest job createdAt', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: [] }))

            const formatted = dayjs(jobCreatedAt).format('MMM DD, YYYY')
            expect(screen.getByTestId('status-alert')).toHaveTextContent(`${STATUS_ALERT_SEPARATOR} ${formatted}`)
        })

        it('renders the action banner with the first-submission title', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: [] }))

            const banner = screen.getByTestId('status-alert')
            const labName = study.submittingLabName ?? study.submittedByOrgSlug
            expect(banner).toHaveAttribute('data-variant', 'action')
            expect(banner).toHaveTextContent(`New code submitted by ${labName}`)
            expect(banner).toHaveTextContent('Review the code files, security log, and AI summary')
            expect(banner).not.toHaveTextContent('Revised code submitted')

            const strongs = banner.querySelectorAll('strong')
            for (const strong of strongs) {
                expect(strong.textContent ?? '').not.toContain(labName)
            }
        })

        it('does not render a Feedback and notes section', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: [] }))

            expect(screen.queryByTestId('feedback-and-notes-section')).not.toBeInTheDocument()
        })

        it('collapses and restores the entire Submitted code section', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: [] }))

            expect(screen.getByTestId('submitted-code-section')).toBeVisible()
            expect(screen.getByTestId('submitted-code-datasets')).toBeVisible()
            expect(screen.getByTestId('ai-summary')).toBeVisible()
            expect(screen.getByTestId('security-scan-log')).toBeVisible()

            const user = userEvent.setup()
            await user.click(screen.getByTestId('study-code-toggle-collapse'))

            await waitFor(() => expect(screen.getByTestId('submitted-code-section')).not.toBeVisible())
            expect(screen.getByTestId('submitted-code-datasets')).not.toBeVisible()
            expect(screen.getByTestId('ai-summary')).not.toBeVisible()
            expect(screen.getByTestId('security-scan-log')).not.toBeVisible()
            const opener = screen.getByTestId('study-code-toggle')
            expect(opener).toHaveTextContent('View full study code')
            expect(opener).toHaveFocus()

            await user.click(opener)

            await waitFor(() => expect(screen.getByTestId('submitted-code-section')).toBeVisible())
            expect(screen.getByTestId('submitted-code-section').parentElement).toHaveFocus()
            expect(screen.getByTestId('study-code-toggle-collapse')).toHaveTextContent('Hide full study code')
        })
    })

    describe('resubmission (prior entries present)', () => {
        // On a resubmission the prior round's reviewer decision and this round's note both
        // surface as feedback entries.
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
        const resubmissionEntries: CodeReviewFeedbackEntry[] = [resubmissionNote, reviewerEntry]

        it('switches the banner title to the revised wording', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: resubmissionEntries }))

            const banner = screen.getByTestId('status-alert')
            const labName = study.submittingLabName ?? study.submittedByOrgSlug
            expect(banner).toHaveTextContent(`Revised code submitted by ${labName}`)
            expect(banner).not.toHaveTextContent('New code submitted')
        })

        it('reflects the resubmission version in the section heading', async () => {
            renderWithProviders(await CodeReview({ orgSlug: ORG_SLUG, study, entries: resubmissionEntries }))

            expect(screen.getByRole('heading', { name: 'Review study code v2.0', level: 2 })).toBeInTheDocument()
            expect(screen.queryByRole('heading', { name: 'Review study code', level: 2 })).not.toBeInTheDocument()
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
            expect(submittedCode.compareDocumentPosition(feedback) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        })

        it('collapses the entire Submitted code section by default on resubmission', async () => {
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
            expect(screen.getByTestId('submitted-code-section')).not.toBeVisible()
            expect(screen.getByTestId('ai-summary')).not.toBeVisible()
            expect(screen.getByTestId('security-scan-log')).not.toBeVisible()
        })
    })
})
