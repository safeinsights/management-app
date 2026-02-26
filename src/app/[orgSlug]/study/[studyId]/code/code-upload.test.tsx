import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { memoryRouter } from 'next-router-mock'
import { TestingProviders } from '@/tests/providers'
import { mockOpenStaxFeatureFlagState } from '@/tests/unit.helpers'
import { CodeUploadPage } from './code-upload'
import type { CodeFileState } from '@/contexts/shared/file-types'

vi.mock('@/components/openstax-feature-flag', () => ({
    useOpenStaxFeatureFlag: () => globalThis.__mockOpenStaxEnabled,
}))

vi.mock('./code-upload-modal', () => ({
    CodeUploadModal: () => <div data-testid="code-upload-modal" />,
}))

vi.mock('./code-files-review', () => ({
    CodeFilesReview: () => <div data-testid="code-files-review" />,
}))

vi.mock('@/components/openstax-only', () => ({
    OpenStaxOnly: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    isOpenStaxOrg: () => false,
}))

const mockSetStudyId = vi.fn()
const mockSetIDECodeFiles = vi.fn()
const mockSubmitStudy = vi.fn()
const mockSetCodeUploadViewMode = vi.fn()

let mockCodeFiles: CodeFileState = { mainFile: null, additionalFiles: [] }
let mockCanProceedToReview = false

vi.mock('@/contexts/study-request', () => ({
    useStudyRequest: () => ({
        codeFiles: mockCodeFiles,
        codeUploadViewMode: 'upload',
        canProceedToReview: mockCanProceedToReview,
        setStudyId: mockSetStudyId,
        setIDECodeFiles: mockSetIDECodeFiles,
        setCodeUploadViewMode: mockSetCodeUploadViewMode,
        submitStudy: mockSubmitStudy,
        isSubmitting: false,
    }),
}))

vi.mock('@/hooks/use-workspace-launcher', () => ({
    useWorkspaceLauncher: () => ({
        launchWorkspace: vi.fn(),
        isLaunching: false,
        isCreatingWorkspace: false,
        error: null,
    }),
}))

const TEST_STUDY_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

const defaultProps = {
    studyId: TEST_STUDY_ID,
    orgSlug: 'test-org',
    submittingOrgSlug: 'test-org',
    language: 'R' as const,
}

describe('CodeUploadPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockOpenStaxFeatureFlagState(false)
        mockCodeFiles = { mainFile: null, additionalFiles: [] }
        mockCanProceedToReview = false
    })

    describe('new flow (feature flag ON)', () => {
        beforeEach(() => {
            mockOpenStaxFeatureFlagState(true)
        })

        it('renders "STEP 4 of 4" step label', () => {
            render(
                <TestingProviders>
                    <CodeUploadPage {...defaultProps} />
                </TestingProviders>,
            )

            expect(screen.getByText('STEP 4 of 4')).toBeInTheDocument()
        })

        it('renders "Submit code" button', () => {
            render(
                <TestingProviders>
                    <CodeUploadPage {...defaultProps} />
                </TestingProviders>,
            )

            expect(screen.getByRole('button', { name: /submit code/i })).toBeInTheDocument()
        })

        it('Previous button navigates to Agreements page', async () => {
            const user = userEvent.setup()
            render(
                <TestingProviders>
                    <CodeUploadPage {...defaultProps} />
                </TestingProviders>,
            )

            await user.click(screen.getByRole('button', { name: /previous/i }))

            await waitFor(() => {
                expect(memoryRouter.asPath).toContain('/agreements')
            })
        })

        it('calls submitStudy when "Submit code" is clicked', async () => {
            const user = userEvent.setup()
            render(
                <TestingProviders>
                    <CodeUploadPage {...defaultProps} existingMainFile="main.R" />
                </TestingProviders>,
            )

            await user.click(screen.getByRole('button', { name: /submit code/i }))

            expect(mockSubmitStudy).toHaveBeenCalled()
        })

        it('initializes context from existing files on mount', () => {
            render(
                <TestingProviders>
                    <CodeUploadPage {...defaultProps} existingMainFile="main.R" existingAdditionalFiles={['helper.R']} />
                </TestingProviders>,
            )

            expect(mockSetIDECodeFiles).toHaveBeenCalledWith('main.R', ['main.R', 'helper.R'])
        })

        it('does NOT call setIDECodeFiles when context already has mainFile', () => {
            mockCodeFiles = {
                mainFile: { type: 'server', path: '/code/main.R', name: 'main.R' },
                additionalFiles: [],
            }

            render(
                <TestingProviders>
                    <CodeUploadPage {...defaultProps} existingMainFile="main.R" />
                </TestingProviders>,
            )

            expect(mockSetIDECodeFiles).not.toHaveBeenCalled()
        })
    })

    describe('old flow (feature flag OFF)', () => {
        it('renders "STEP 4 of 5" step label', () => {
            render(
                <TestingProviders>
                    <CodeUploadPage {...defaultProps} />
                </TestingProviders>,
            )

            expect(screen.getByText('STEP 4 of 5')).toBeInTheDocument()
        })

        it('renders "Proceed to review" button', () => {
            render(
                <TestingProviders>
                    <CodeUploadPage {...defaultProps} />
                </TestingProviders>,
            )

            expect(screen.getByRole('button', { name: /proceed to review/i })).toBeInTheDocument()
        })

        it('Previous button navigates to Edit page', async () => {
            const user = userEvent.setup()
            render(
                <TestingProviders>
                    <CodeUploadPage {...defaultProps} />
                </TestingProviders>,
            )

            await user.click(screen.getByRole('button', { name: /previous/i }))

            await waitFor(() => {
                expect(memoryRouter.asPath).toContain('/edit')
            })
        })

        it('"Proceed to review" is enabled when existingMainFile is present', () => {
            render(
                <TestingProviders>
                    <CodeUploadPage {...defaultProps} existingMainFile="main.R" />
                </TestingProviders>,
            )

            const button = screen.getByRole('button', { name: /proceed to review/i })
            expect(button).not.toBeDisabled()
        })
    })
})
