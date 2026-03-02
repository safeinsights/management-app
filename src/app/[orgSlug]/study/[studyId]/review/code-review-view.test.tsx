import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { setupStudyAction } from '@/tests/db-action.helpers'
import { describe, expect, it, vi } from 'vitest'
import { CodeReviewView } from './code-review-view'

vi.mock('@/components/page-breadcrumbs', () => ({
    OrgBreadcrumbs: () => <div data-testid="org-breadcrumbs" />,
}))

vi.mock('@/components/study/study-code-details', () => ({
    StudyCodeDetails: () => <div data-testid="study-code-details" />,
}))

vi.mock('@/components/study/study-details', () => ({
    StudyDetails: () => <div data-testid="study-details" />,
}))

vi.mock('./study-results-with-review', () => ({
    StudyResultsWithReview: () => <div data-testid="study-results-with-review" />,
}))

describe('CodeReviewView', () => {
    it('renders Study Code section', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'enclave' })

        renderWithProviders(await CodeReviewView({ orgSlug: org.slug, study }))

        expect(screen.getByTestId('study-code-details')).toBeInTheDocument()
    })

    it('does NOT render Study Proposal section', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'enclave' })

        renderWithProviders(await CodeReviewView({ orgSlug: org.slug, study }))

        expect(screen.queryByTestId('study-details')).not.toBeInTheDocument()
    })

    it('renders StudyResultsWithReview', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'enclave' })

        renderWithProviders(await CodeReviewView({ orgSlug: org.slug, study }))

        expect(screen.getByTestId('study-results-with-review')).toBeInTheDocument()
    })

    it('renders Previous button linking to Agreements', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'enclave' })

        renderWithProviders(await CodeReviewView({ orgSlug: org.slug, study }))

        const previousButton = screen.getByRole('link', { name: /previous/i })
        expect(previousButton).toBeInTheDocument()
        expect(previousButton).toHaveAttribute('href', expect.stringContaining('/agreements'))
    })
})
