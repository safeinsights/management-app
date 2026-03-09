import { describe, it, expect, vi } from 'vitest'
import { renderWithProviders, screen, waitFor } from '@/tests/unit.helpers'
import { CodeFilesReview } from './code-files-review'
import { StudyRequestProvider } from '@/contexts/study-request'
import type { DraftStudyData } from '@/contexts/study-request/study-request-types'

const defaultProps = {
    previousHref: '/test-org/study/123/details' as import('next').Route,
    onBack: vi.fn(),
    onProceed: vi.fn(),
    onOpenUploadModal: vi.fn(),
}

describe('CodeFilesReview', () => {
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

    it('renders Previous button linking to previousHref', () => {
        renderWithProviders(
            <StudyRequestProvider submittingOrgSlug="test-org">
                <CodeFilesReview {...defaultProps} />
            </StudyRequestProvider>,
        )

        const link = screen.getByRole('link', { name: /previous/i })
        expect(link).toHaveAttribute('href', '/test-org/study/123/details')
    })

    it('disables Previous button when isSubmitting', () => {
        renderWithProviders(
            <StudyRequestProvider submittingOrgSlug="test-org">
                <CodeFilesReview {...defaultProps} isSubmitting />
            </StudyRequestProvider>,
        )

        expect(screen.getByRole('link', { name: /previous/i })).toHaveAttribute('data-disabled', 'true')
    })

    it('shows empty state message when no files uploaded', () => {
        renderWithProviders(
            <StudyRequestProvider submittingOrgSlug="test-org">
                <CodeFilesReview {...defaultProps} />
            </StudyRequestProvider>,
        )

        expect(screen.getByText(/no files uploaded/i)).toBeInTheDocument()
    })

    it('renders file table with files from initialDraft', async () => {
        const draft: DraftStudyData = {
            id: 'test-study-id',
            orgSlug: 'test-org',
            language: 'R',
            mainCodeFileName: 'main.R',
            additionalCodeFileNames: ['helper.R'],
        }

        renderWithProviders(
            <StudyRequestProvider submittingOrgSlug="test-org" initialDraft={draft} initialStudyId={draft.id}>
                <CodeFilesReview {...defaultProps} />
            </StudyRequestProvider>,
        )

        await waitFor(() => {
            expect(screen.getByText('main.R')).toBeInTheDocument()
        })
        expect(screen.getByText('helper.R')).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: /select main.R as main file/i })).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: /select helper.R as main file/i })).toBeInTheDocument()
    })
})
