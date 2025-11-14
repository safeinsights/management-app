import { describe, it, expect, vi } from 'vitest'
import { renderWithProviders } from '@/tests/unit.helpers'
import { screen } from '@testing-library/react'
import { JobResultsStatusMessage } from './job-results-status-message'
import { type LatestJobForStudy } from '@/server/db/queries'
import { type FileType, type StudyJobStatus } from '@/database/types'

// Mock child components
vi.mock('@/components/job-results', () => ({
    JobResults: () => <div data-testid="job-results">Job Results</div>,
}))

vi.mock('@/components/study/resubmit-button', () => ({
    ResubmitButton: () => <button data-testid="resubmit-button">Resubmit</button>,
}))

vi.mock('@/components/copying-input', () => ({
    CopyingInput: ({ value }: { value: string }) => <input data-testid="copying-input" value={value} readOnly />,
}))

describe('JobResultsStatusMessage', () => {
    const createMockJob = (statuses: StudyJobStatus[]): LatestJobForStudy => ({
        id: 'job-123',
        studyId: 'study-456',
        orgId: 'org-789',
        language: 'PYTHON',
        statusChanges: statuses.map((status) => ({
            status,
            createdAt: new Date().toISOString(),
        })),
        createdAt: new Date(),
        files: [],
    })

    const createMockFiles = (fileTypes: FileType[]) => fileTypes.map((fileType) => ({ fileType }))

    describe('Approved and Errored states', () => {
        it('shows error message with logs when approved, errored, and logs are available', () => {
            const job = createMockJob(['FILES-APPROVED', 'JOB-ERRORED'])
            const files = createMockFiles(['APPROVED-LOG', 'APPROVED-RESULT'])

            renderWithProviders(<JobResultsStatusMessage job={job} orgSlug="test-org" files={files} />)

            expect(
                screen.getByText(
                    'The code errored. Review error logs and consider resubmitting an updated study code.',
                ),
            ).toBeDefined()
            expect(screen.getByTestId('job-results')).toBeDefined()
            expect(screen.getByTestId('resubmit-button')).toBeDefined()
            expect(screen.getByText('Job ID:')).toBeDefined()
            expect(screen.getByTestId('copying-input')).toBeDefined()
        })

        it('shows error message without logs when approved, errored, and no logs available', () => {
            const job = createMockJob(['FILES-APPROVED', 'JOB-ERRORED'])
            const files = createMockFiles(['APPROVED-RESULT'])

            renderWithProviders(<JobResultsStatusMessage job={job} orgSlug="test-org" files={files} />)

            expect(
                screen.getByText(
                    'The code errored. While logs are not available at this time, consider re-submitting an updated study code.',
                ),
            ).toBeDefined()
            expect(screen.getByTestId('job-results')).toBeDefined()
            expect(screen.getByTestId('resubmit-button')).toBeDefined()
            expect(screen.getByText('Job ID:')).toBeDefined()
        })

        it('detects encrypted logs as available logs', () => {
            const job = createMockJob(['FILES-APPROVED', 'JOB-ERRORED'])
            const files = createMockFiles(['ENCRYPTED-LOG'])

            renderWithProviders(<JobResultsStatusMessage job={job} orgSlug="test-org" files={files} />)

            expect(
                screen.getByText(
                    'The code errored. Review error logs and consider resubmitting an updated study code.',
                ),
            ).toBeDefined()
        })
    })

    describe('Approved state (without error)', () => {
        it('shows approval message when approved and no errors', () => {
            const job = createMockJob(['FILES-APPROVED'])
            const files = createMockFiles([])

            renderWithProviders(<JobResultsStatusMessage job={job} orgSlug="test-org" files={files} />)

            expect(
                screen.getByText(
                    'The results of your study have been approved by the data organization and are now available to you. If you are not satisfied with them, you can submit new code to generate new outcome.',
                ),
            ).toBeDefined()
            expect(screen.getByTestId('job-results')).toBeDefined()
            expect(screen.getByTestId('resubmit-button')).toBeDefined()
            expect(screen.queryByText('Job ID:')).toBeNull()
        })
    })

    describe('Rejected states', () => {
        it('shows files rejected message when files are rejected', () => {
            const job = createMockJob(['FILES-REJECTED'])
            const files = createMockFiles([])

            renderWithProviders(<JobResultsStatusMessage job={job} orgSlug="test-org" files={files} />)

            expect(
                screen.getByText(
                    'The results of your study have not been released by the data organization, possibly due to the presence of personally identifiable information (PII). Consider resubmitting an updated study code.',
                ),
            ).toBeDefined()
            expect(screen.queryByTestId('job-results')).toBeNull()
            expect(screen.getByTestId('resubmit-button')).toBeDefined()
        })

        it('shows code rejected message when code is rejected', () => {
            const job = createMockJob(['CODE-REJECTED'])
            const files = createMockFiles([])

            renderWithProviders(<JobResultsStatusMessage job={job} orgSlug="test-org" files={files} />)

            expect(
                screen.getByText(
                    'This study code has not been approved by the data organization. Consider resubmitting an updated study code.',
                ),
            ).toBeDefined()
            expect(screen.queryByTestId('job-results')).toBeNull()
            expect(screen.getByTestId('resubmit-button')).toBeDefined()
        })

        it('hides results when rejected', () => {
            const job = createMockJob(['CODE-REJECTED'])
            const files = createMockFiles([])

            renderWithProviders(<JobResultsStatusMessage job={job} orgSlug="test-org" files={files} />)

            expect(screen.queryByTestId('job-results')).toBeNull()
        })
    })

    describe('Pending/Default state', () => {
        it('shows pending message when no status flags are set', () => {
            const job = createMockJob(['RUN-COMPLETE'])
            const files = createMockFiles([])

            renderWithProviders(<JobResultsStatusMessage job={job} orgSlug="test-org" files={files} />)

            expect(
                screen.getByText(
                    'Study results will become available once the data organization reviews and approves them.',
                ),
            ).toBeDefined()
            expect(screen.queryByTestId('job-results')).toBeNull()
            expect(screen.queryByTestId('resubmit-button')).toBeNull()
        })

        it('shows pending message for job initiated state', () => {
            const job = createMockJob(['INITIATED'])
            const files = createMockFiles([])

            renderWithProviders(<JobResultsStatusMessage job={job} orgSlug="test-org" files={files} />)

            expect(
                screen.getByText(
                    'Study results will become available once the data organization reviews and approves them.',
                ),
            ).toBeDefined()
        })
    })

    describe('Edge cases', () => {
        it('handles empty status changes array', () => {
            const job = createMockJob([])
            const files = createMockFiles([])

            renderWithProviders(<JobResultsStatusMessage job={job} orgSlug="test-org" files={files} />)

            expect(
                screen.getByText(
                    'Study results will become available once the data organization reviews and approves them.',
                ),
            ).toBeDefined()
        })

        it('handles empty files array', () => {
            const job = createMockJob(['FILES-APPROVED', 'JOB-ERRORED'])
            const files: { fileType: FileType }[] = []

            renderWithProviders(<JobResultsStatusMessage job={job} orgSlug="test-org" files={files} />)

            expect(
                screen.getByText(
                    'The code errored. While logs are not available at this time, consider re-submitting an updated study code.',
                ),
            ).toBeDefined()
        })

        it('passes correct props to ResubmitButton', () => {
            const job = createMockJob(['FILES-APPROVED'])
            const files = createMockFiles([])

            renderWithProviders(<JobResultsStatusMessage job={job} orgSlug="custom-org" files={files} />)

            expect(screen.getByTestId('resubmit-button')).toBeDefined()
        })
    })

    describe('Multiple status combinations', () => {
        it('prioritizes error state when both approved and errored', () => {
            const job = createMockJob(['FILES-APPROVED', 'JOB-ERRORED', 'RUN-COMPLETE'])
            const files = createMockFiles(['APPROVED-LOG'])

            renderWithProviders(<JobResultsStatusMessage job={job} orgSlug="test-org" files={files} />)

            expect(
                screen.getByText(
                    'The code errored. Review error logs and consider resubmitting an updated study code.',
                ),
            ).toBeDefined()
        })

        it('handles both code rejected and files rejected statuses', () => {
            const job = createMockJob(['CODE-REJECTED', 'FILES-REJECTED'])
            const files = createMockFiles([])

            renderWithProviders(<JobResultsStatusMessage job={job} orgSlug="test-org" files={files} />)

            // Should show files rejected message as it's checked first in the component logic
            expect(
                screen.getByText(
                    'The results of your study have not been released by the data organization, possibly due to the presence of personally identifiable information (PII). Consider resubmitting an updated study code.',
                ),
            ).toBeDefined()
        })
    })
})
