import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/tests/unit.helpers'
import { JobReviewButtons } from '@/app/member/[memberIdentifier]/study/[studyIdentifier]/review/job-review-buttons'
import { Study, StudyJob } from '@/schema/study'
import { faker } from '@faker-js/faker'
import { dataForJobAction } from '@/server/actions/study-job.actions'
import { screen } from '@testing-library/react'

vi.mock('@/server/actions/study-job.actions', () => ({
    dataForJobAction: vi.fn(),
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
    approvedAt: null,
    rejectedAt: null,
}

const mockApprovedStudyJob: StudyJob = {
    createdAt: faker.date.past(),
    id: faker.string.uuid(),
    resultFormat: 'SI_V1_ENCRYPT',
    resultsPath: faker.system.filePath(),
    studyId: mockStudy.id,
    approvedAt: new Date(),
    rejectedAt: null,
}

const mockRejectedStudyJob: StudyJob = {
    createdAt: faker.date.past(),
    id: faker.string.uuid(),
    resultFormat: 'SI_V1_ENCRYPT',
    resultsPath: faker.system.filePath(),
    studyId: mockStudy.id,
    approvedAt: null,
    rejectedAt: new Date(),
}

describe('Study Results Approve/Reject buttons', () => {
    vi.mocked(dataForJobAction).mockResolvedValue({
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
            memberIdentifier: 'test-org',
        },
    })

    it('does not render when missing job info', async () => {
        vi.mocked(dataForJobAction).mockResolvedValue({
            jobInfo: undefined,
            manifest: {
                jobId: '',
                language: 'r',
                files: {},
                size: 0,
                tree: { label: '', value: '', size: 0, children: [] },
            },
        })
        renderWithProviders(<JobReviewButtons job={mockApprovedStudyJob} decryptedResults={['123asdf']} />)
        expect(screen.queryByText('Reject')).toBeNull()
        expect(screen.queryByText('Approve')).toBeNull()
    })

    it('renders the approve/reject buttons when there is an unreviewed job', async () => {
        vi.mocked(dataForJobAction).mockResolvedValue({
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
                memberIdentifier: 'test-org',
            },
        })
        renderWithProviders(<JobReviewButtons job={mockUnreviewedStudyJob} decryptedResults={['123asdf']} />)
        expect(screen.queryByRole('button', { name: 'Approve' })).toBeDefined()
        expect(screen.queryByRole('button', { name: 'Reject' })).toBeDefined()
    })

    it('renders the approved timestamp for an approved job', async () => {
        vi.mocked(dataForJobAction).mockResolvedValue({
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
                memberIdentifier: 'test-org',
            },
        })
        renderWithProviders(<JobReviewButtons job={mockApprovedStudyJob} decryptedResults={['123asdf']} />)
        expect(screen.queryByText(/approved on/i)).toBeDefined()
    })

    it('renders the rejected timestamp for a rejected job', async () => {
        vi.mocked(dataForJobAction).mockResolvedValue({
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
                memberIdentifier: 'test-org',
            },
        })
        renderWithProviders(<JobReviewButtons job={mockRejectedStudyJob} decryptedResults={['123asdf']} />)
        expect(screen.queryByText(/rejected on/i)).toBeDefined()
    })
})
