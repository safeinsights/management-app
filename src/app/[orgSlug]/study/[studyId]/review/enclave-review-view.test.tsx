import { NotFoundError } from '@/lib/errors'
import { renderWithProviders, screen, setupStudyAction } from '@/tests/unit.helpers'
import { describe, expect, it, vi } from 'vitest'
import { EnclaveReviewView } from './enclave-review-view'

vi.mock('@/components/page-breadcrumbs', () => ({
    OrgBreadcrumbs: () => <div data-testid="org-breadcrumbs" />,
}))

vi.mock('@/components/openstax-feature-flag', () => ({
    FeatureFlagRequiredAlert: ({ message }: { message?: string }) => (
        <div data-testid="feature-flag-alert">{message}</div>
    ),
}))

vi.mock('@/components/study/study-code-details', () => ({
    StudyCodeDetails: () => <div data-testid="study-code-details" />,
}))

vi.mock('@/components/study/study-details', () => ({
    StudyDetails: () => <div data-testid="study-details" />,
}))

vi.mock('@/components/study/study-approval-status', () => ({
    default: () => <div data-testid="study-approval-status" />,
}))

vi.mock('./study-results', () => ({
    StudyResults: () => <div data-testid="study-results" />,
}))

vi.mock('./study-review-buttons', () => ({
    StudyReviewButtons: () => <div data-testid="study-review-buttons" />,
}))

describe('EnclaveReviewView', () => {
    it('shows feature-flag alert for feature-flag org with no job', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'enclave', createJob: false })

        renderWithProviders(await EnclaveReviewView({ orgSlug: org.slug, study }))

        const alert = screen.getByTestId('feature-flag-alert')
        expect(alert).toBeInTheDocument()
        expect(alert).toHaveTextContent('created via spy mode without code upload')
        expect(alert).toHaveTextContent(study.title)
        expect(screen.queryByTestId('study-code-details')).not.toBeInTheDocument()
    })

    it('shows full view for feature-flag org with job', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'enclave' })

        renderWithProviders(await EnclaveReviewView({ orgSlug: org.slug, study }))

        expect(screen.getByTestId('study-code-details')).toBeInTheDocument()
        expect(screen.getByTestId('study-results')).toBeInTheDocument()
        expect(screen.getByTestId('study-review-buttons')).toBeInTheDocument()
        expect(screen.queryByTestId('feature-flag-alert')).not.toBeInTheDocument()
    })

    it('shows full view for non-feature-flag org with job', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'regular-org', orgType: 'enclave' })

        renderWithProviders(await EnclaveReviewView({ orgSlug: org.slug, study }))

        expect(screen.getByTestId('study-code-details')).toBeInTheDocument()
        expect(screen.getByTestId('study-results')).toBeInTheDocument()
        expect(screen.getByTestId('study-review-buttons')).toBeInTheDocument()
        expect(screen.queryByTestId('feature-flag-alert')).not.toBeInTheDocument()
    })

    it('throws NotFoundError for non-feature-flag org with no job', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'regular-org', orgType: 'enclave', createJob: false })

        await expect(EnclaveReviewView({ orgSlug: org.slug, study })).rejects.toThrow(NotFoundError)
    })
})
