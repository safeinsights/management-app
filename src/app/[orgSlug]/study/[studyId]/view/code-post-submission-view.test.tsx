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
    type Mock,
} from '@/tests/unit.helpers'
import { getStudyAction, type CodeReviewFeedbackEntry, type SelectedStudy } from '@/server/actions/study.actions'
import { latestJobForStudy, type LatestJobForStudy } from '@/server/db/queries'
import { Routes } from '@/lib/routes'
import { CodePostSubmissionView } from './code-post-submission-view'

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
        dashboardHref?: Route
        reviewingOrgName?: string
        returnTo?: 'org'
        submissionVersion?: number
        feedbackEntries?: CodeReviewFeedbackEntry[]
        isUnderReview?: boolean
    } = {},
) {
    renderWithProviders(
        <CodePostSubmissionView
            orgSlug={ORG_SLUG}
            study={study}
            job={job}
            reviewingOrgName={overrides.reviewingOrgName ?? REVIEWING_ORG_NAME}
            dashboardHref={overrides.dashboardHref}
            returnTo={overrides.returnTo}
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
    describe('breadcrumbs and header', () => {
        it('renders STEP 4, page title "Study proposal", section title "Study code", and study title', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job)

            expect(screen.getByText('STEP 4')).toBeInTheDocument()
            expect(screen.getByRole('heading', { level: 1, name: 'Study proposal' })).toBeInTheDocument()
            expect(screen.getByRole('heading', { level: 4, name: 'Study code' })).toBeInTheDocument()
            expect(screen.getByText(/Title:\s*Effect of Reading Comprehension Tools/)).toBeInTheDocument()
        })

        it('renders "Submitted on {date}" using the CODE-SUBMITTED status timestamp', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job)

            expect(screen.getByTestId('code-submitted-timestamp').textContent).toMatch(
                /^Submitted on \w{3} \d{2}, \d{4}$/,
            )
        })
    })

    describe('banner', () => {
        it('renders the yellow status banner with the data org name and the Figma copy', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job, { reviewingOrgName: REVIEWING_ORG_NAME })

            const banner = screen.getByTestId('code-under-review-banner')
            expect(banner).toHaveTextContent(REVIEWING_ORG_NAME)
            expect(banner).toHaveTextContent(/AI-generated summary of its behavior/)
            expect(banner).toHaveTextContent(/7-10 business days/)
            expect(banner).toHaveTextContent(/email notifications about updates/)
        })

        it('renders the banner with the AC-specified background color #FFF9E5', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job)

            const banner = screen.getByTestId('code-under-review-banner')
            expect(banner).toHaveStyle({ backgroundColor: '#FFF9E5' })
        })

        it('hides the under-review banner when isUnderReview is false (reached via results-page Previous)', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job, { isUnderReview: false })

            expect(screen.queryByTestId('code-under-review-banner')).not.toBeInTheDocument()
            // The rest of the page still renders (e.g. the submitted timestamp).
            expect(screen.getByTestId('code-submitted-timestamp')).toBeInTheDocument()
        })
    })

    describe('submitted code section', () => {
        it('renders the section collapsed by default', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job)

            expect(screen.getByTestId('study-code-toggle')).toHaveAttribute('aria-expanded', 'false')
        })

        it('expands when "View full study code" is clicked and shows the table + new-tab proposal anchor', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job)

            const interact = userEvent.setup()
            await interact.click(screen.getByTestId('study-code-toggle'))

            // The outer "View full study code" toggle unmounts once expanded.
            expect(screen.queryByTestId('study-code-toggle')).not.toBeInTheDocument()
            expect(screen.getByTestId('submitted-code-table')).toBeInTheDocument()
            expect(
                screen.getByText('View the code files that you uploaded to run against the dataset.'),
            ).toBeInTheDocument()

            const proposalAnchor = screen.getByRole('link', { name: 'View approved initial request' })
            expect(proposalAnchor).toHaveAttribute('target', '_blank')
            expect(proposalAnchor).toHaveAttribute(
                'href',
                expect.stringContaining(`/${ORG_SLUG}/study/${study.id}/submitted`),
            )
        })

        it('renders read-only star (no button role), no delete control, and eye icon as a preview button', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job)

            const interact = userEvent.setup()
            await interact.click(screen.getByTestId('study-code-toggle'))

            // Star is decorative only (aria-label set, but not a button)
            expect(screen.getByLabelText('Main file')).toBeInTheDocument()
            expect(screen.queryByRole('button', { name: /set .* as main file/i })).not.toBeInTheDocument()

            // No delete/trash control
            expect(screen.queryByRole('button', { name: /remove main\.R/i })).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: /remove helper\.R/i })).not.toBeInTheDocument()

            // Eye icons render as buttons that open the shared FilePreviewModal
            expect(screen.getByRole('button', { name: 'View main.R' })).toBeInTheDocument()
            expect(screen.getByRole('button', { name: 'View helper.R' })).toBeInTheDocument()
        })

        it('collapses when the in-section "Hide full study code" anchor is clicked', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job)

            const interact = userEvent.setup()
            await interact.click(screen.getByTestId('study-code-toggle'))

            // After expansion the outer "View full study code" toggle unmounts; only the
            // in-section "Hide full study code" anchor remains.
            expect(screen.queryByTestId('study-code-toggle')).not.toBeInTheDocument()

            await interact.click(screen.getByText('Hide full study code'))

            expect(screen.getByTestId('study-code-toggle')).toHaveAttribute('aria-expanded', 'false')
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
            await interact.click(screen.getByTestId('study-code-toggle'))

            expect(screen.getByText('main.R')).toBeInTheDocument()
            expect(screen.getByText('helper.R')).toBeInTheDocument()
            expect(screen.queryByText('encrypted-logs.zip')).not.toBeInTheDocument()
            expect(screen.queryByText('security-scan-log.txt')).not.toBeInTheDocument()
        })
    })

    describe('navigation', () => {
        it('renders Back as a link to studyResearcherAgreements (no ?from=) and Go to dashboard linking to dashboardHref', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job, { dashboardHref: Routes.orgDashboard({ orgSlug: ORG_SLUG }) })

            const backLink = screen.getByRole('link', { name: /back/i })
            const backHref = backLink.getAttribute('href') ?? ''
            expect(backHref).toContain(`/${ORG_SLUG}/study/${study.id}/agreements/researcher`)
            expect(backHref).not.toContain('from=')

            const dashboardButton = screen.getByRole('link', { name: 'Go to dashboard' })
            expect(dashboardButton).toHaveAttribute('href', '/openstax/dashboard')
        })

        it('threads returnTo=org onto the Back → agreements link so org scope survives the hop', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job, { returnTo: 'org' })

            const backHref = screen.getByRole('link', { name: /back/i }).getAttribute('href') ?? ''
            expect(backHref).toContain(`/${ORG_SLUG}/study/${study.id}/agreements/researcher`)
            expect(backHref).toContain('returnTo=org')
        })

        it('falls back to Routes.dashboard when no dashboardHref is provided', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job)

            expect(screen.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute('href', '/dashboard')
        })
    })

    describe('resubmission (v2+)', () => {
        it('renders the v2 heading, "Resubmitted on" timestamp, and "has been resubmitted" banner', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job, {
                submissionVersion: 2,
                feedbackEntries: [reviewerFeedbackEntry(), resubmissionNoteEntry()],
            })

            expect(screen.getByRole('heading', { level: 4, name: 'Study code v2.0' })).toBeInTheDocument()
            expect(screen.getByTestId('code-submitted-timestamp').textContent).toMatch(
                /^Resubmitted on \w{3} \d{2}, \d{4}$/,
            )

            const banner = screen.getByTestId('code-under-review-banner')
            expect(banner).toHaveTextContent(/has been resubmitted to/)
            expect(banner).toHaveTextContent(REVIEWING_ORG_NAME)
            expect(banner).not.toHaveTextContent(/has been submitted to/)
        })

        it('shows the compact "View submitted study code" toggle (no v1 expand row) and renders the feedback section', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job, {
                submissionVersion: 2,
                feedbackEntries: [reviewerFeedbackEntry(), resubmissionNoteEntry()],
            })

            expect(screen.getByText('View submitted study code')).toBeInTheDocument()
            expect(screen.queryByText('View full study code')).not.toBeInTheDocument()
            expect(screen.getByTestId('feedback-and-notes-section')).toBeInTheDocument()
        })

        it('does not render the feedback section when feedbackEntries is empty', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job, { submissionVersion: 2, feedbackEntries: [] })

            expect(screen.queryByTestId('feedback-and-notes-section')).not.toBeInTheDocument()
        })

        it('keeps v1 layout unchanged: shows "Study code" (no v suffix), "Submitted on", and no feedback section', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job, { submissionVersion: 1 })

            expect(screen.getByRole('heading', { level: 4, name: 'Study code' })).toBeInTheDocument()
            expect(screen.getByTestId('code-submitted-timestamp').textContent).toMatch(/^Submitted on /)
            expect(screen.queryByText('View submitted study code')).not.toBeInTheDocument()
            expect(screen.queryByTestId('feedback-and-notes-section')).not.toBeInTheDocument()
        })
    })
})
