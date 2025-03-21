import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/tests/unit.helpers'
import { screen } from '@testing-library/react'
import { StudyResults } from '@/app/member/[memberIdentifier]/study/[studyIdentifier]/review/study-results'
import { StudyJob } from '@/schema/study'
import { faker } from '@faker-js/faker'

const mockStudyJob: StudyJob = {
    createdAt: new Date(),
    id: faker.string.uuid(),
    resultFormat: 'SI_V1_ENCRYPT',
    resultsPath: faker.system.filePath(),
    studyId: faker.string.uuid(),
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
})
