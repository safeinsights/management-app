import { describe, expect, it } from 'vitest'
import { StudyJobStatus, StudyStatus } from '@/database/types'
import { renderWithProviders } from '@/tests/unit.helpers'
import { screen } from '@testing-library/react'
import { DisplayStudyStatus } from './display-study-status'

describe('DisplayStudyStatus', () => {
    const testCases: Array<{
        studyStatus: StudyStatus
        jobStatus: StudyJobStatus | null
        expectedProposalText: string
        expectedStatusText: string
    }> = [
        {
            studyStatus: 'PENDING-REVIEW',
            jobStatus: null,
            expectedProposalText: 'Proposal',
            expectedStatusText: 'Under Review',
        },
        {
            studyStatus: 'APPROVED',
            jobStatus: null,
            expectedProposalText: 'Proposal',
            expectedStatusText: 'Approved',
        },
        {
            studyStatus: 'REJECTED',
            jobStatus: null,
            expectedProposalText: 'Proposal',
            expectedStatusText: 'Rejected',
        },
        {
            studyStatus: 'APPROVED',
            jobStatus: 'JOB-PACKAGING',
            expectedProposalText: 'Code',
            expectedStatusText: 'Processing',
        },
        {
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'JOB-ERRORED',
            expectedProposalText: 'Code',
            expectedStatusText: 'Errored',
        },
        {
            studyStatus: 'APPROVED',
            jobStatus: 'RUN-COMPLETE',
            expectedProposalText: 'Results',
            expectedStatusText: 'Under Review',
        },
        {
            studyStatus: 'APPROVED',
            jobStatus: 'FILES-REJECTED',
            expectedProposalText: 'Results',
            expectedStatusText: 'Rejected',
        },
        {
            studyStatus: 'APPROVED',
            jobStatus: 'FILES-APPROVED',
            expectedProposalText: 'Results',
            expectedStatusText: 'Approved',
        },
    ]

    testCases.forEach(({ studyStatus, jobStatus, expectedProposalText, expectedStatusText }) => {
        it(`renders correct status for studyStatus: ${studyStatus}, jobStatus: ${jobStatus}`, () => {
            renderWithProviders(<DisplayStudyStatus studyStatus={studyStatus} jobStatus={jobStatus} />)

            const proposalText = screen.getByText(expectedProposalText)
            const statusText = screen.getByText(expectedStatusText)

            expect(proposalText).toBeDefined()
            expect(statusText).toBeDefined()
        })
    })
})
