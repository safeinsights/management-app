import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import { latestJobForStudy } from '@/server/db/queries'
import {
    actionResult,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
} from '@/tests/unit.helpers'
import { describe, expect, it, vi } from 'vitest'
import { CodeOnlyView } from './code-only-view'

vi.mock('@/components/page-breadcrumbs', () => ({
    ResearcherBreadcrumbs: () => <div data-testid="researcher-breadcrumbs" />,
}))

vi.mock('@/components/study/study-code-details', () => ({
    StudyCodeDetails: () => <div data-testid="study-code-details" />,
}))

vi.mock('@/components/study/study-details', () => ({
    StudyDetails: () => <div data-testid="study-details" />,
}))

vi.mock('./job-results-status-message', () => ({
    JobResultsStatusMessage: () => <div data-testid="job-results-status-message" />,
}))

describe('CodeOnlyView', () => {
    let study: SelectedStudy

    const setupStudy = async (orgSlug: string) => {
        const { org, user } = await mockSessionWithTestData({ orgSlug, orgType: 'lab' })
        const { study: dbStudy, job } = await insertTestStudyJobData({ org, researcherId: user.id })
        study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        const latestJob = await latestJobForStudy(dbStudy.id)
        return { org, orgSlug, job: latestJob! }
    }

    it('renders Study Code section', async () => {
        const { orgSlug, job } = await setupStudy('openstax')

        renderWithProviders(<CodeOnlyView orgSlug={orgSlug} study={study} job={job} />)

        expect(screen.getByTestId('study-code-details')).toBeInTheDocument()
    })

    it('does NOT render Study Proposal section', async () => {
        const { orgSlug, job } = await setupStudy('openstax')

        renderWithProviders(<CodeOnlyView orgSlug={orgSlug} study={study} job={job} />)

        expect(screen.queryByTestId('study-details')).not.toBeInTheDocument()
    })

    it('renders JobResultsStatusMessage', async () => {
        const { orgSlug, job } = await setupStudy('openstax')

        renderWithProviders(<CodeOnlyView orgSlug={orgSlug} study={study} job={job} />)

        expect(screen.getByTestId('job-results-status-message')).toBeInTheDocument()
    })

    it('renders Previous button linking to Agreements', async () => {
        const { orgSlug, job } = await setupStudy('openstax')

        renderWithProviders(<CodeOnlyView orgSlug={orgSlug} study={study} job={job} />)

        const previousButton = screen.getByRole('link', { name: /previous/i })
        expect(previousButton).toBeInTheDocument()
        expect(previousButton).toHaveAttribute('href', expect.stringContaining('/agreements'))
    })

    it('renders ResearcherBreadcrumbs', async () => {
        const { orgSlug, job } = await setupStudy('openstax')

        renderWithProviders(<CodeOnlyView orgSlug={orgSlug} study={study} job={job} />)

        expect(screen.getByTestId('researcher-breadcrumbs')).toBeInTheDocument()
    })
})
