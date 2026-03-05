import { describe, it, expect, vi } from 'vitest'
import {
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    faker,
} from '@/tests/unit.helpers'
import StudyReviewPage from './page'

vi.mock('./code-only-view', () => ({
    CodeOnlyView: () => <div data-testid="code-only-view" />,
}))

vi.mock('./job-results-status-message', () => ({
    JobResultsStatusMessage: () => <div data-testid="job-results-status-message" />,
}))

vi.mock('@/components/study/study-details', () => ({
    StudyDetails: () => <div data-testid="study-details" />,
}))

vi.mock('@/components/study/study-code-details', () => ({
    StudyCodeDetails: () => <div data-testid="study-code-details" />,
}))

vi.mock('@/components/study/study-approval-status', () => ({
    __esModule: true,
    default: () => <div data-testid="study-approval-status" />,
}))

describe('StudyViewPage', () => {
    it('renders CodeOnlyView when job exists', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        const page = await StudyReviewPage({ params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }) })
        renderWithProviders(page!)

        expect(screen.getByTestId('code-only-view')).toBeInTheDocument()
    })

    it('renders full details when no job exists', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await StudyReviewPage({ params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }) })
        renderWithProviders(page!)

        expect(screen.getByTestId('study-details')).toBeInTheDocument()
        expect(screen.queryByTestId('code-only-view')).not.toBeInTheDocument()
    })

    it('throws when study does not exist', async () => {
        await mockSessionWithTestData({ orgType: 'lab' })

        await expect(
            StudyReviewPage({
                params: Promise.resolve({ orgSlug: 'test-org', studyId: faker.string.uuid() }),
            }),
        ).rejects.toThrow()
    })
})
