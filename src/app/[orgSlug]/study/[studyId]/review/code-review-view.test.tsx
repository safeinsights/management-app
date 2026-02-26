import { renderWithProviders, screen, setupStudyAction } from '@/tests/unit.helpers'
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

vi.mock('./security-scan-panel', () => ({
    SecurityScanPanel: () => <div data-testid="security-scan-panel" />,
}))

vi.mock('./study-results', () => ({
    StudyResults: () => <div data-testid="study-results" />,
}))

vi.mock('./study-review-buttons', () => ({
    StudyReviewButtons: () => <div data-testid="study-review-buttons" />,
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

    it('renders SecurityScanPanel and StudyResults', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'enclave' })

        renderWithProviders(await CodeReviewView({ orgSlug: org.slug, study }))

        expect(screen.getByTestId('security-scan-panel')).toBeInTheDocument()
        expect(screen.getByTestId('study-results')).toBeInTheDocument()
    })

    it('renders StudyReviewButtons', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'enclave' })

        renderWithProviders(await CodeReviewView({ orgSlug: org.slug, study }))

        expect(screen.getByTestId('study-review-buttons')).toBeInTheDocument()
    })

    it('renders Previous button linking to Agreements', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'enclave' })

        renderWithProviders(await CodeReviewView({ orgSlug: org.slug, study }))

        const previousButton = screen.getByRole('link', { name: /previous/i })
        expect(previousButton).toBeInTheDocument()
        expect(previousButton).toHaveAttribute('href', expect.stringContaining('/agreements'))
    })
})
