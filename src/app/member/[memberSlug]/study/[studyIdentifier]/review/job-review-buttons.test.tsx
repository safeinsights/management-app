import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/tests/unit.helpers'
import { JobReviewButtons } from './job-review-buttons'
import { Study, StudyJob } from '@/schema/study'
import { faker } from '@faker-js/faker'
import { loadStudyJobAction } from '@/server/actions/study-job.actions'
import { screen } from '@testing-library/react'

vi.mock('@/server/actions/study-job.actions', () => ({
    loadStudyJobAction: vi.fn(),
    approveStudyJobResultsAction: vi.fn(),
    rejectStudyJobResultsAction: vi.fn(),
}))

const mockStudy: Study = {
    approvedAt: faker.datatype.boolean() ? faker.date.past() : null,
    containerLocation: faker.system.directoryPath(),
    createdAt: faker.date.past(),
    dataSources: faker.helpers.arrayElements(['source1', 'source2', 'source3']),
    descriptionDocPath: faker.datatype.boolean() ? faker.system.filePath() : null,
    id: faker.string.uuid(),
    irbDocPath: faker.datatype.boolean() ? faker.system.filePath() : null,
    irbProtocols: faker.datatype.boolean() ? faker.lorem.sentence() : null,
    agreementDocPath: faker.datatype.boolean() ? faker.lorem.sentence() : null,
    memberId: faker.string.uuid(),
    outputMimeType: faker.datatype.boolean() ? faker.system.mimeType() : null,
    piName: faker.person.fullName(),
    rejectedAt: faker.datatype.boolean() ? faker.date.past() : null,
    researcherId: faker.string.uuid(),
    status: 'APPROVED',
    title: faker.lorem.sentence(),
    reviewerId: faker.string.uuid(),
}

const mockUnreviewedStudyJob: StudyJob = {
    createdAt: faker.date.past(),
    id: faker.string.uuid(),
    resultFormat: 'SI_V1_ENCRYPT',
    resultsPath: faker.system.filePath(),
    studyId: mockStudy.id,
}

const mockApprovedStudyJob: StudyJob = {
    createdAt: faker.date.past(),
    id: faker.string.uuid(),
    resultFormat: 'SI_V1_ENCRYPT',
    resultsPath: faker.system.filePath(),
    studyId: mockStudy.id,
}

const mockRejectedStudyJob: StudyJob = {
    createdAt: faker.date.past(),
    id: faker.string.uuid(),
    resultFormat: 'SI_V1_ENCRYPT',
    resultsPath: faker.system.filePath(),
    studyId: mockStudy.id,
}

describe('Study Results Approve/Reject buttons', () => {
    const testResults = [{ path: 'test.csv', contents: new TextEncoder().encode('test123').buffer as ArrayBuffer }]
    vi.mocked(loadStudyJobAction).mockResolvedValue({
        manifest: {
            jobId: '',
            language: 'r',
            files: {},
            size: 0,
            tree: { label: '', value: '', size: 0, children: [] },
        },
        jobInfo: {
            studyId: mockStudy.id,
            createdAt: new Date(),
            studyJobId: mockApprovedStudyJob.id,
            studyTitle: mockStudy.title,
            memberSlug: 'test-org',
            jobStatusCreatedAt: new Date(),
            jobStatus: 'CODE-APPROVED',
        },
    })

    it('does not render when missing job info', async () => {
        vi.mocked(loadStudyJobAction).mockResolvedValue({
            jobInfo: undefined,
            manifest: {
                jobId: '',
                language: 'r',
                files: {},
                size: 0,
                tree: { label: '', value: '', size: 0, children: [] },
            },
        })
        renderWithProviders(<JobReviewButtons job={mockApprovedStudyJob} decryptedResults={testResults} />)
        expect(screen.queryByText('Reject')).toBeNull()
        expect(screen.queryByText('Approve')).toBeNull()
    })

    it('renders the approve/reject buttons when there is an unreviewed job', async () => {
        vi.mocked(loadStudyJobAction).mockResolvedValue({
            manifest: {
                jobId: '',
                language: 'r',
                files: {},
                size: 0,
                tree: { label: '', value: '', size: 0, children: [] },
            },
            jobInfo: {
                studyId: mockStudy.id,
                createdAt: new Date(),
                studyJobId: mockApprovedStudyJob.id,
                studyTitle: mockStudy.title,
                memberSlug: 'test-org',
                jobStatusCreatedAt: new Date(),
                jobStatus: 'CODE-APPROVED',
            },
        })
        renderWithProviders(<JobReviewButtons job={mockUnreviewedStudyJob} decryptedResults={testResults} />)
        expect(screen.queryByRole('button', { name: 'Approve' })).toBeDefined()
        expect(screen.queryByRole('button', { name: 'Reject' })).toBeDefined()
    })

    it('renders the approved timestamp for an approved job', async () => {
        vi.mocked(loadStudyJobAction).mockResolvedValue({
            manifest: {
                jobId: '',
                language: 'r',
                files: {},
                size: 0,
                tree: { label: '', value: '', size: 0, children: [] },
            },
            jobInfo: {
                studyId: mockStudy.id,
                createdAt: new Date(),
                studyJobId: mockApprovedStudyJob.id,
                studyTitle: mockStudy.title,
                memberSlug: 'test-org',
                jobStatusCreatedAt: new Date(),
                jobStatus: 'RESULTS-APPROVED',
            },
        })
        renderWithProviders(<JobReviewButtons job={mockApprovedStudyJob} decryptedResults={testResults} />)
        expect(screen.queryByText(/approved on/i)).toBeDefined()
    })

    it('renders the rejected timestamp for a rejected job', async () => {
        vi.mocked(loadStudyJobAction).mockResolvedValue({
            manifest: {
                jobId: '',
                language: 'r',
                files: {},
                size: 0,
                tree: { label: '', value: '', size: 0, children: [] },
            },
            jobInfo: {
                studyId: mockStudy.id,
                createdAt: new Date(),
                studyJobId: mockRejectedStudyJob.id,
                studyTitle: mockStudy.title,
                memberSlug: 'test-org',
                jobStatusCreatedAt: new Date(),
                jobStatus: 'RESULTS-REJECTED',
            },
        })
        renderWithProviders(<JobReviewButtons job={mockRejectedStudyJob} decryptedResults={testResults} />)
        expect(screen.queryByText(/rejected on/i)).toBeDefined()
    })
})
