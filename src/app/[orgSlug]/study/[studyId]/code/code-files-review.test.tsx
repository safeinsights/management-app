import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { CodeFilesReview } from './code-files-review'
import { StudyRequestProvider } from '@/contexts/study-request'

const defaultProps = {
    onBack: vi.fn(),
    onProceed: vi.fn(),
    onOpenUploadModal: vi.fn(),
}

describe('CodeFilesReview', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('renders "STEP 4 of 4" step label', () => {
        renderWithProviders(
            <StudyRequestProvider submittingOrgSlug="test-org">
                <CodeFilesReview {...defaultProps} />
            </StudyRequestProvider>,
        )

        expect(screen.getByText('STEP 4 of 4')).toBeInTheDocument()
    })

    it('renders "Submit code" button', () => {
        renderWithProviders(
            <StudyRequestProvider submittingOrgSlug="test-org">
                <CodeFilesReview {...defaultProps} />
            </StudyRequestProvider>,
        )

        expect(screen.getByRole('button', { name: /submit code/i })).toBeInTheDocument()
    })

    it('shows loading state on proceed button when isSubmitting', () => {
        renderWithProviders(
            <StudyRequestProvider submittingOrgSlug="test-org">
                <CodeFilesReview {...defaultProps} isSubmitting />
            </StudyRequestProvider>,
        )

        const button = screen.getByRole('button', { name: /submit code/i })
        expect(button).toHaveAttribute('data-loading', 'true')
    })

    it('disables Back button when isSubmitting', () => {
        renderWithProviders(
            <StudyRequestProvider submittingOrgSlug="test-org">
                <CodeFilesReview {...defaultProps} isSubmitting />
            </StudyRequestProvider>,
        )

        expect(screen.getByRole('button', { name: /back to upload/i })).toBeDisabled()
    })
})
