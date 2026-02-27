import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { setupStudyAction } from '@/tests/db-action.helpers'
import { describe, expect, it, vi } from 'vitest'
import { CodeOnlyView } from './code-only-view'

vi.mock('@/components/page-breadcrumbs', () => ({
    ResearcherBreadcrumbs: () => <div data-testid="researcher-breadcrumbs" />,
}))

vi.mock('@/components/study/study-code-details', () => ({
    StudyCodeDetails: () => <div data-testid="study-code-details" />,
}))

vi.mock('./job-results-status-message', () => ({
    JobResultsStatusMessage: () => <div data-testid="job-results-status-message" />,
}))

describe('CodeOnlyView', () => {
    it('renders Study Code section', async () => {
        const { org, study, latestJob } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'lab' })

        renderWithProviders(<CodeOnlyView orgSlug={org.slug} study={study} job={latestJob!} />)

        expect(screen.getByTestId('study-code-details')).toBeInTheDocument()
    })

    it('renders JobResultsStatusMessage', async () => {
        const { org, study, latestJob } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'lab' })

        renderWithProviders(<CodeOnlyView orgSlug={org.slug} study={study} job={latestJob!} />)

        expect(screen.getByTestId('job-results-status-message')).toBeInTheDocument()
    })

    it('renders Previous button linking to Agreements', async () => {
        const { org, study, latestJob } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'lab' })

        renderWithProviders(<CodeOnlyView orgSlug={org.slug} study={study} job={latestJob!} />)

        const previousButton = screen.getByRole('link', { name: /previous/i })
        expect(previousButton).toBeInTheDocument()
        expect(previousButton).toHaveAttribute('href', expect.stringContaining('/agreements'))
    })

    it('renders ResearcherBreadcrumbs', async () => {
        const { org, study, latestJob } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'lab' })

        renderWithProviders(<CodeOnlyView orgSlug={org.slug} study={study} job={latestJob!} />)

        expect(screen.getByTestId('researcher-breadcrumbs')).toBeInTheDocument()
    })
})
