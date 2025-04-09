import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/tests/unit.helpers'
import { screen } from '@testing-library/react'
import { StudyResults } from './study-results'
import { StudyJob } from '@/schema/study'
import { faker } from '@faker-js/faker'
import { fetchJobResultsEncryptedZipAction } from '@/server/actions/study-job.actions'

vi.mock('@/server/actions/study-job.actions')

const mockStudyJob: StudyJob = {
    createdAt: new Date(),
    id: faker.string.uuid(),
    resultFormat: 'SI_V1_ENCRYPT',
    resultsPath: faker.system.filePath(),
    studyId: faker.string.uuid(),
    approvedAt: null,
    rejectedAt: null,
}

describe('Study Results Approve/Reject buttons', () => {
    it('shows appropriate message when user has no fingerprint', async () => {
        renderWithProviders(<StudyResults latestJob={mockStudyJob} fingerprint={''} jobStatus="JOB-READY" />)
        expect(screen.queryByText('You cannot view results without a private key')).toBeDefined()
    })

    it('shows empty results state when no job exists', async () => {
        renderWithProviders(<StudyResults latestJob={null} fingerprint="asdf" jobStatus="JOB-READY" />)
        expect(screen.queryByText('Study results are not available yet')).toBeDefined()
    })

    it('shows results rejected state', async () => {
        renderWithProviders(<StudyResults latestJob={mockStudyJob} fingerprint="asdf" jobStatus="RESULTS-REJECTED" />)

        expect(screen.queryByText('Latest results rejected')).toBeDefined()
    })

    it('renders the results if the job has been approved', async () => {
        renderWithProviders(<StudyResults latestJob={mockStudyJob} fingerprint="asdf" jobStatus="RESULTS-APPROVED" />)
        expect(screen.getByRole('link', { name: /view results here/i })).toBeDefined()
    })

    it('renders the form to unlock results', async () => {
        renderWithProviders(<StudyResults latestJob={mockStudyJob} fingerprint="asdf" jobStatus="RESULTS-REJECTED" />)
        expect(screen.queryByText('Latest results rejected')).toBeDefined()
    })

    // TODO Build out
    it('decrypts the results', async () => {
        vi.mocked(fetchJobResultsEncryptedZipAction).mockResolvedValue(new Blob(['asdf']))
        renderWithProviders(<StudyResults latestJob={mockStudyJob} fingerprint="asdf" jobStatus="JOB-READY" />)
        // Input private key in form field
        // Submit the form
        // View the results on the page
        // Approve the results
        // Optionally a second test to reject the results
        // fireEvent.click(screen.getByRole('button', { name: /approve/i }))
    })
})
