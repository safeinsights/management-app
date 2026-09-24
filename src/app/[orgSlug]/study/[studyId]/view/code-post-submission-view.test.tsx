import { describe, expect, it } from 'vitest'
import { useParams } from 'next/navigation'
import { memoryRouter } from 'next-router-mock'
import type { Route } from 'next'
import {
    actionResult,
    db,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    within,
    type Mock,
} from '@/tests/unit.helpers'
import { getStudyAction, type CodeReviewFeedbackEntry, type SelectedStudy } from '@/server/actions/study.actions'
import { latestJobForStudy, type LatestJobForStudy } from '@/server/db/queries'
import type { StepNav } from '@/lib/study-screen'
import { STATUS_ALERT_SEPARATOR } from '@/components/study/status-alert'
import { CodePostSubmissionView } from './code-post-submission-view'
// Which buttons a decision/state earns is resolveStepNav's job (see lib/study-screen/nav.test.ts);
// these views only have to render the nav they are handed.
const NAV: StepNav = {
    back: { label: 'Previous step', href: '/prev' as Route, variant: 'subtle', testId: 'cta-previous-step' },
    forward: {
        label: 'Back to my studies',
        href: '/dashboard' as Route,
        variant: 'solid',
        testId: 'cta-back-to-my-studies',
    },
}

const ORG_SLUG = 'openstax'
const REVIEWING_ORG_NAME = 'OpenStax Reviewers'

async function setupSubmittedStudy() {
    const { org, user } = await mockSessionWithTestData({ orgSlug: ORG_SLUG, orgType: 'lab' })
    const { study: dbStudy, job } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        studyStatus: 'PENDING-REVIEW',
        jobStatus: 'CODE-SUBMITTED',
        title: 'Effect of Reading Comprehension Tools',
    })

    await db
        .insertInto('studyJobFile')
        .values([
            {
                studyJobId: job.id,
                name: 'main.R',
                path: `${org.slug}/${dbStudy.id}/${job.id}/main.R`,
                fileType: 'MAIN-CODE',
            },
            {
                studyJobId: job.id,
                name: 'helper.R',
                path: `${org.slug}/${dbStudy.id}/${job.id}/helper.R`,
                fileType: 'SUPPLEMENTAL-CODE',
            },
        ])
        .execute()

    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    const latestJob = (await latestJobForStudy(dbStudy.id)) as LatestJobForStudy
    ;(useParams as Mock).mockReturnValue({ orgSlug: ORG_SLUG, studyId: study.id })
    memoryRouter.setCurrentUrl('/')
    return { org, study, job: latestJob }
}

function renderView(
    study: SelectedStudy,
    job: LatestJobForStudy,
    overrides: {
        reviewingOrgName?: string
        nav?: StepNav
        submissionVersion?: number
        feedbackEntries?: CodeReviewFeedbackEntry[]
        isUnderReview?: boolean
    } = {},
) {
    renderWithProviders(
        <CodePostSubmissionView
            study={study}
            job={job}
            reviewingOrgName={overrides.reviewingOrgName ?? REVIEWING_ORG_NAME}
            nav={overrides.nav ?? NAV}
            submissionVersion={overrides.submissionVersion ?? 1}
            feedbackEntries={overrides.feedbackEntries ?? []}
            isUnderReview={overrides.isUnderReview}
        />,
    )
}

const sampleLexicalBody = (text: string) => ({
    root: {
        children: [
            {
                children: [{ detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 }],
                direction: 'ltr',
                format: '',
                indent: 0,
                type: 'paragraph',
                version: 1,
            },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
    },
})

const reviewerFeedbackEntry = (): CodeReviewFeedbackEntry => ({
    id: 'reviewer-fb-1',
    authorId: 'author-1',
    entryType: 'REVIEWER-FEEDBACK',
    decision: 'NEEDS-CLARIFICATION',
    body: sampleLexicalBody('The submitted code needs some clarification before approval.'),
    criteria: null,
    createdAt: new Date('2026-04-02T00:00:00Z'),
    authorName: 'Jessica Walters',
    version: 1,
})

const resubmissionNoteEntry = (): CodeReviewFeedbackEntry => ({
    id: 'note-1',
    authorId: 'researcher-1',
    entryType: 'RESUBMISSION-NOTE',
    decision: null,
    body: sampleLexicalBody('All feedback has been reviewed and addressed.'),
    criteria: null,
    createdAt: new Date('2026-04-06T00:00:00Z'),
    authorName: 'Debshilla Basu Mallick',
    version: 2,
})

describe('CodePostSubmissionView', () => {
    describe('header', () => {
        it('reuses the shared section header with STEP 3 / Submit code and no study title as body text', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job)

            const header = screen.getByTestId('proposal-section-header')
            expect(within(header).getByText('STEP 3')).toBeInTheDocument()
            expect(within(header).getByRole('heading', { level: 2, name: 'Submit code' })).toBeInTheDocument()

            const title = study.title ?? ''
            expect(title).not.toBe('')
            expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
            expect(within(header).queryByText(/^Title:/)).not.toBeInTheDocument()
            expect(header).not.toHaveTextContent(title)
        })

        it('dates the banner title from the CODE-SUBMITTED status timestamp', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job, { reviewingOrgName: REVIEWING_ORG_NAME })

            expect(screen.getByTestId('status-alert').textContent).toMatch(
                new RegExp(`Code submitted to ${REVIEWING_ORG_NAME} \\${STATUS_ALERT_SEPARATOR} \\w{3} \\d{2}, \\d{4}`),
            )
        })
    })

    describe('banner', () => {
        it('renders the informative banner with the data partner name and the AC copy', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job, { reviewingOrgName: REVIEWING_ORG_NAME })

            const banner = screen.getByTestId('status-alert')
            expect(banner).toHaveAttribute('data-variant', 'informative')
            expect(banner).toHaveTextContent('Code submitted to')
            expect(banner).toHaveTextContent(REVIEWING_ORG_NAME)
            expect(banner).toHaveTextContent(/AI summary of its behavior/)
            expect(banner).toHaveTextContent(/An email notification will be sent/)
            expect(banner).toHaveTextContent(/Reviews typically take 7 to 10 days/)
        })

        it('hides the under-review banner when isUnderReview is false (reached via results-page Previous)', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job, { isUnderReview: false })

            expect(screen.queryByTestId('status-alert')).not.toBeInTheDocument()
        })
    })

    describe('code files section', () => {
        it('renders a standalone Code files section with the submitted code table', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job)

            const section = screen.getByTestId('submitted-code-files-section')
            expect(within(section).getByRole('heading', { name: 'Code files' })).toBeInTheDocument()
            expect(within(section).getByTestId('submitted-code-table')).toBeInTheDocument()
        })

        it('shows only the first code file by default and hides the rest behind a toggle', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job)

            const section = screen.getByTestId('submitted-code-files-section')
            expect(within(section).getByText('main.R')).toBeInTheDocument()
            expect(within(section).queryByText('helper.R')).not.toBeInTheDocument()

            const toggle = within(section).getByTestId('view-all-code-files-toggle')
            expect(toggle).toHaveTextContent('View all code files')
        })

        it('expands all files when "View all code files" is clicked', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job)

            const interact = userEvent.setup()
            await interact.click(screen.getByTestId('view-all-code-files-toggle'))

            const section = screen.getByTestId('submitted-code-files-section')
            expect(within(section).getByText('main.R')).toBeInTheDocument()
            expect(within(section).getByText('helper.R')).toBeInTheDocument()
            expect(screen.getByTestId('view-all-code-files-toggle')).toHaveTextContent('Hide code files')
        })

        it('renders read-only star (no button role), no delete control, and eye icon as a preview button', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job)

            const interact = userEvent.setup()
            await interact.click(screen.getByTestId('view-all-code-files-toggle'))

            expect(screen.getByLabelText('Main file')).toBeInTheDocument()
            expect(screen.queryByRole('button', { name: /set .* as main file/i })).not.toBeInTheDocument()

            expect(screen.queryByRole('button', { name: /remove main\.R/i })).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: /remove helper\.R/i })).not.toBeInTheDocument()

            expect(screen.getByRole('button', { name: 'View main.R' })).toBeInTheDocument()
            expect(screen.getByRole('button', { name: 'View helper.R' })).toBeInTheDocument()
        })

        it('excludes non-code files (security scan logs, encrypted logs) from the submitted code table', async () => {
            const { org, user } = await mockSessionWithTestData({ orgSlug: ORG_SLUG, orgType: 'lab' })
            const { study: dbStudy, job } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'PENDING-REVIEW',
                jobStatus: 'CODE-SUBMITTED',
                title: 'Mixed Files Study',
            })
            await db
                .insertInto('studyJobFile')
                .values([
                    {
                        studyJobId: job.id,
                        name: 'main.R',
                        path: `${org.slug}/${dbStudy.id}/${job.id}/main.R`,
                        fileType: 'MAIN-CODE',
                    },
                    {
                        studyJobId: job.id,
                        name: 'helper.R',
                        path: `${org.slug}/${dbStudy.id}/${job.id}/helper.R`,
                        fileType: 'SUPPLEMENTAL-CODE',
                    },
                    {
                        studyJobId: job.id,
                        name: 'encrypted-logs.zip',
                        path: `${org.slug}/${dbStudy.id}/${job.id}/encrypted-logs.zip`,
                        fileType: 'ENCRYPTED-SECURITY-SCAN-LOG',
                    },
                    {
                        studyJobId: job.id,
                        name: 'security-scan-log.txt',
                        path: `${org.slug}/${dbStudy.id}/${job.id}/security-scan-log.txt`,
                        fileType: 'SECURITY-SCAN-LOG',
                    },
                ])
                .execute()

            const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
            const latestJob = (await latestJobForStudy(dbStudy.id)) as LatestJobForStudy
            ;(useParams as Mock).mockReturnValue({ orgSlug: ORG_SLUG, studyId: study.id })
            renderView(study, latestJob)

            const interact = userEvent.setup()
            await interact.click(screen.getByTestId('view-all-code-files-toggle'))

            expect(screen.getByText('main.R')).toBeInTheDocument()
            expect(screen.getByText('helper.R')).toBeInTheDocument()
            expect(screen.queryByText('encrypted-logs.zip')).not.toBeInTheDocument()
            expect(screen.queryByText('security-scan-log.txt')).not.toBeInTheDocument()
        })
    })

    describe('navigation', () => {
        it('renders the step nav it is handed, and nothing of its own', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job)

            expect(screen.getByTestId('cta-previous-step')).toHaveAttribute('href', '/prev')
            expect(screen.getByTestId('cta-back-to-my-studies')).toHaveAttribute('href', '/dashboard')
        })

        it('renders no step nav at all when the nav is empty', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job, { nav: {} })

            expect(screen.queryByTestId('step-navigation')).not.toBeInTheDocument()
        })
    })

    describe('resubmission (v2+)', () => {
        it('keeps the Submit code heading and a versioned resubmitted banner title', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job, {
                submissionVersion: 2,
                reviewingOrgName: REVIEWING_ORG_NAME,
                feedbackEntries: [reviewerFeedbackEntry(), resubmissionNoteEntry()],
            })

            expect(screen.getByRole('heading', { level: 2, name: 'Submit code' })).toBeInTheDocument()

            const banner = screen.getByTestId('status-alert')
            expect(banner).toHaveTextContent(`Code v2.0 resubmitted to ${REVIEWING_ORG_NAME}`)
            expect(banner).not.toHaveTextContent('Code submitted to')
        })

        it('renders the Code files section (not a toggle in the header) and the feedback section', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job, {
                submissionVersion: 2,
                feedbackEntries: [reviewerFeedbackEntry(), resubmissionNoteEntry()],
            })

            expect(screen.getByTestId('submitted-code-files-section')).toBeInTheDocument()
            expect(screen.getByTestId('feedback-and-notes-section')).toBeInTheDocument()
        })

        it('does not render the feedback section when feedbackEntries is empty', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job, { submissionVersion: 2, feedbackEntries: [] })

            expect(screen.queryByTestId('feedback-and-notes-section')).not.toBeInTheDocument()
        })

        it('keeps v1 layout unchanged: "Submit code" heading, first-submission banner, no feedback section', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job, { submissionVersion: 1 })

            expect(screen.getByRole('heading', { level: 2, name: 'Submit code' })).toBeInTheDocument()
            expect(screen.getByTestId('status-alert')).toHaveTextContent('Code submitted to')
            expect(screen.queryByTestId('feedback-and-notes-section')).not.toBeInTheDocument()
        })
    })
})
