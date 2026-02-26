import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { CodeFilesReview } from './code-files-review'
import { type CodeFileState, type ServerFile } from '@/contexts/shared/file-types'

const mockMainFile: ServerFile = { type: 'server', path: '/code/main.R', name: 'main.R' }

const mockCodeFiles: CodeFileState = {
    mainFile: mockMainFile,
    additionalFiles: [],
}

vi.mock('@/contexts/study-request', () => ({
    useStudyRequest: () => ({
        codeFiles: mockCodeFiles,
        codeFilesLastUpdated: new Date('2025-01-15T10:30:00Z'),
        removeCodeFile: vi.fn(),
        setMainCodeFile: vi.fn(),
    }),
}))

const defaultProps = {
    onBack: vi.fn(),
    onProceed: vi.fn(),
    onOpenUploadModal: vi.fn(),
}

describe('CodeFilesReview', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('renders "STEP 4 of 4" when isNewFlow is true', () => {
        renderWithProviders(<CodeFilesReview {...defaultProps} isNewFlow />)

        expect(screen.getByText('STEP 4 of 4')).toBeInTheDocument()
    })

    it('renders "Submit code" button when isNewFlow is true', () => {
        renderWithProviders(<CodeFilesReview {...defaultProps} isNewFlow />)

        expect(screen.getByRole('button', { name: /submit code/i })).toBeInTheDocument()
    })

    it('shows loading state on proceed button when isNewFlow and isSubmitting', () => {
        renderWithProviders(<CodeFilesReview {...defaultProps} isNewFlow isSubmitting />)

        const button = screen.getByRole('button', { name: /submit code/i })
        expect(button).toHaveAttribute('data-loading', 'true')
    })

    it('renders "STEP 4 of 5" when isNewFlow is false', () => {
        renderWithProviders(<CodeFilesReview {...defaultProps} />)

        expect(screen.getByText('STEP 4 of 5')).toBeInTheDocument()
    })

    it('renders "Save and proceed to review" button when isNewFlow is false', () => {
        renderWithProviders(<CodeFilesReview {...defaultProps} />)

        expect(screen.getByRole('button', { name: /save and proceed to review/i })).toBeInTheDocument()
    })
})
