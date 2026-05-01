import { describe, expect, it } from 'vitest'
import { useParams } from 'next/navigation'
import { memoryRouter } from 'next-router-mock'
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
import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import { latestJobForStudy, type LatestJobForStudy } from '@/server/db/queries'
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
    overrides: { dashboardHref?: string; reviewingOrgName?: string } = {},
) {
    renderWithProviders(
        <CodePostSubmissionView
            orgSlug={ORG_SLUG}
            study={study}
            job={job}
            reviewingOrgName={overrides.reviewingOrgName ?? REVIEWING_ORG_NAME}
            dashboardHref={overrides.dashboardHref}
        />,
    )
}

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
        it('renders the yellow status banner with the data org name and the 7-10 days copy', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job, { reviewingOrgName: REVIEWING_ORG_NAME })

            const banner = screen.getByTestId('code-under-review-banner')
            expect(banner).toHaveTextContent(REVIEWING_ORG_NAME)
            expect(banner).toHaveTextContent(/7-10 days/)
            expect(banner).toHaveTextContent(/successfully submitted/)
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

            expect(screen.getByTestId('study-code-toggle')).toHaveAttribute('aria-expanded', 'true')
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

        it('renders read-only star (no button role), no delete control, and eye icon as anchor opening in a new tab', async () => {
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

            // Eye icons render as anchors opening in a new tab
            const viewAnchor = screen.getByRole('link', { name: 'View main.R' })
            expect(viewAnchor).toHaveAttribute('target', '_blank')
            expect(viewAnchor.getAttribute('href')).toMatch(new RegExp(`/dl/study-code/${job.id}/main.R$`))
        })

        it('collapses when "Hide full study code" is clicked', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job)

            const interact = userEvent.setup()
            const toggle = screen.getByTestId('study-code-toggle')
            await interact.click(toggle)
            expect(toggle).toHaveAttribute('aria-expanded', 'true')

            await interact.click(toggle)
            expect(toggle).toHaveAttribute('aria-expanded', 'false')
        })
    })

    describe('navigation', () => {
        it('renders Previous as a link to studyAgreements with from=previous and Go to dashboard linking to dashboardHref', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job, { dashboardHref: '/openstax/dashboard' })

            const previousLink = screen.getByRole('link', { name: /previous/i })
            expect(previousLink).toHaveAttribute(
                'href',
                expect.stringContaining(`/${ORG_SLUG}/study/${study.id}/agreements?from=previous`),
            )

            const dashboardButton = screen.getByRole('link', { name: 'Go to dashboard' })
            expect(dashboardButton).toHaveAttribute('href', '/openstax/dashboard')
        })

        it('falls back to Routes.dashboard when no dashboardHref is provided', async () => {
            const { study, job } = await setupSubmittedStudy()
            renderView(study, job)

            expect(screen.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute('href', '/dashboard')
        })
    })
})
