import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import {
    actionResult,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    type Mock,
} from '@/tests/unit.helpers'
import dayjs from 'dayjs'
import { useParams } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CodeReviewRedesignView } from './code-review-redesign-view'

// The global setup mocks @/components/page-breadcrumbs to return null; opt back into
// the real component here so we can assert the rendered breadcrumb links.
vi.unmock('@/components/page-breadcrumbs')

const ORG_SLUG = 'test-org'

describe('CodeReviewRedesignView', () => {
    let study: SelectedStudy
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
        study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        jobCreatedAt = latestJobWithStatus.createdAt
        ;(useParams as Mock).mockReturnValue({ orgSlug: ORG_SLUG, studyId: study.id })
    })

    it('renders the H1 page title "Study Proposal"', async () => {
        renderWithProviders(await CodeReviewRedesignView({ orgSlug: ORG_SLUG, study }))

        expect(screen.getByRole('heading', { name: 'Study Proposal', level: 1 })).toBeInTheDocument()
    })

    it('renders all three breadcrumbs with the expected links', async () => {
        renderWithProviders(await CodeReviewRedesignView({ orgSlug: ORG_SLUG, study }))

        const dashboardLink = screen.getByRole('link', { name: 'Dashboard' })
        expect(dashboardLink).toHaveAttribute('href', `/${ORG_SLUG}/dashboard`)

        const proposalLink = screen.getByRole('link', { name: 'Study proposal' })
        expect(proposalLink).toHaveAttribute('href', `/${ORG_SLUG}/study/${study.id}/review?from=code-review`)

        // "Study code" is the terminal crumb and should not be a link
        expect(screen.getByText('Study code')).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'Study code' })).not.toBeInTheDocument()
    })

    it('renders the STEP 3 sub-label and the section heading', async () => {
        renderWithProviders(await CodeReviewRedesignView({ orgSlug: ORG_SLUG, study }))

        expect(screen.getByText('STEP 3')).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Review study code', level: 4 })).toBeInTheDocument()
    })

    it('renders the study title in the section header', async () => {
        renderWithProviders(await CodeReviewRedesignView({ orgSlug: ORG_SLUG, study }))

        expect(screen.getByText(/Title: Effect of Reading Comprehension Tools/)).toBeInTheDocument()
    })

    it('renders "Submitted on {date}" formatted from the latest job createdAt', async () => {
        renderWithProviders(await CodeReviewRedesignView({ orgSlug: ORG_SLUG, study }))

        const formatted = dayjs(jobCreatedAt).format('MMM DD, YYYY')
        expect(screen.getByTestId('proposal-timestamp')).toHaveTextContent(`Submitted on ${formatted}`)
    })

    it('renders the status banner with the submitting lab name in bold', async () => {
        renderWithProviders(await CodeReviewRedesignView({ orgSlug: ORG_SLUG, study }))

        const banner = screen.getByTestId('code-review-status-banner')
        expect(banner).toBeInTheDocument()
        const labName = study.submittingLabName ?? study.submittedByOrgSlug
        expect(banner).toHaveTextContent(labName)
        expect(banner).toHaveTextContent(
            'has submitted their study code for review. Below, you will review their code and an AI-generated summary of its behavior, then share your feedback and decision.',
        )
    })

    it('renders all four review criteria', async () => {
        renderWithProviders(await CodeReviewRedesignView({ orgSlug: ORG_SLUG, study }))

        const criteria = screen.getByTestId('code-review-criteria')
        expect(criteria).toHaveTextContent('Proposal alignment:')
        expect(criteria).toHaveTextContent('Does the code align with the approved research proposal?')
        expect(criteria).toHaveTextContent('Agreement compliance:')
        expect(criteria).toHaveTextContent('Does the code comply with all the agreements?')
        expect(criteria).toHaveTextContent('Security checks:')
        expect(criteria).toHaveTextContent('Have security and vulnerability checks been passed?')
        expect(criteria).toHaveTextContent('Privacy protection:')
        expect(criteria).toHaveTextContent('Is there any risk of PII exposure expected in the outputs?')
    })
})
