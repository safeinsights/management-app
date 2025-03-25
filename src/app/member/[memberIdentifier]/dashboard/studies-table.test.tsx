import { describe, expect, it, vi } from 'vitest'
import { Member } from '@/schema/member'
import { fetchStudiesForCurrentMemberAction } from '@/server/actions/study.actions'
import { renderWithProviders } from '@/tests/unit.helpers'
import { DisplayStudyStatus, StudiesTable } from './studies-table'
import { screen, waitFor } from '@testing-library/react'
import { StudyJobStatus, StudyStatus } from '@/database/types'
vi.mock('@/server/actions/study.actions', () => ({
    fetchStudiesForCurrentMemberAction: vi.fn(),
}))

const mockMember: Member = {
    id: '1',
    identifier: 'test-member',
    name: 'Test Member',
    email: 'test@example.com',
    publicKey: 'test-key',
    createdAt: new Date(),
    updatedAt: new Date(),
}

const mockStudies = [
    {
        id: 'study-1',
        approvedAt: null,
        rejectedAt: null,
        containerLocation: 'Location1',
        createdAt: new Date(),
        dataSources: [],
        irbProtocols: null,
        memberId: 'member-1',
        outputMimeType: null,
        piName: 'PI Name 1',
        researcherId: 'researcher-1',
        status: 'PENDING-REVIEW' as StudyStatus,
        title: 'Study Title 1',
        researcherName: 'Person A',
        latestStudyJobId: 'job-1',
        studyJobCreatedAt: new Date(),
        latestJobStatus: 'JOB-PACKAGING' as StudyJobStatus,
        statusCreatedAt: new Date(),
        memberIdentifier: 'test-member',
    },
    {
        id: 'study-2',
        approvedAt: null,
        rejectedAt: null,
        containerLocation: 'Location2',
        createdAt: new Date(),
        dataSources: [],
        irbProtocols: null,
        memberId: 'member-2',
        outputMimeType: null,
        piName: 'PI Name 2',
        researcherId: 'researcher-2',
        status: 'APPROVED' as StudyStatus,
        title: 'Study Title 2',
        researcherName: 'Person B',
        latestStudyJobId: 'job-2',
        studyJobCreatedAt: new Date(),
        latestJobStatus: 'RUN-COMPLETE' as StudyJobStatus,
        statusCreatedAt: new Date(),
        memberIdentifier: 'test-member',
    },
    {
        id: 'study-3',
        approvedAt: null,
        rejectedAt: null,
        containerLocation: 'Location3',
        createdAt: new Date(),
        dataSources: [],
        irbProtocols: null,
        memberId: 'member-3',
        outputMimeType: null,
        piName: 'PI Name 3',
        researcherId: 'researcher-3',
        status: 'PENDING-REVIEW' as StudyStatus,
        title: 'Study Title 3',
        researcherName: 'Person C',
        latestStudyJobId: null,
        studyJobCreatedAt: null,
        latestJobStatus: null,
        statusCreatedAt: null,
        memberIdentifier: 'test-member',
    },
]

describe('Studies Table', () => {
    it('renders empty state when no studies', async () => {
        vi.mocked(fetchStudiesForCurrentMemberAction).mockResolvedValue([])

        renderWithProviders(<StudiesTable member={mockMember} />)
        expect(screen.getByText(/You have no studies to review/i)).toBeDefined()
    })

    it('renders the table when studies exist', async () => {
        vi.mocked(fetchStudiesForCurrentMemberAction).mockResolvedValue(mockStudies)

        renderWithProviders(<StudiesTable member={mockMember} />)

        await waitFor(() => {
            expect(screen.getByText(/Study Title 1/i)).toBeDefined()
        })
    })
})

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
            jobStatus: 'RESULTS-REJECTED',
            expectedProposalText: 'Results',
            expectedStatusText: 'Rejected',
        },
        {
            studyStatus: 'APPROVED',
            jobStatus: 'RESULTS-APPROVED',
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
