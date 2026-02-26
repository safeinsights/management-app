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

vi.mock('@/components/study/job-approval-status', () => ({
    ApprovalStatus: () => <div data-testid="job-approval-status" />,
}))

vi.mock('@/components/page-breadcrumbs', () => ({
    ResearcherBreadcrumbs: () => <div data-testid="researcher-breadcrumbs" />,
}))

vi.mock('@/components/openstax-feature-flag', () => ({
    OpenStaxFeatureFlag: ({ defaultContent, optInContent }: { defaultContent: React.ReactNode; optInContent: React.ReactNode }) => (
        <>
            <div data-testid="flag-default">{defaultContent}</div>
            <div data-testid="flag-optin">{optInContent}</div>
        </>
    ),
}))

describe('StudyViewPage', () => {
    it('renders CodeOnlyView as opt-in when job exists', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        const page = await StudyReviewPage({ params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }) })
        renderWithProviders(page!)

        expect(screen.getByTestId('flag-optin').querySelector('[data-testid="code-only-view"]')).toBeInTheDocument()
    })

    it('renders default content as opt-in when no job exists', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ orgSlug: org.slug })

        const page = await StudyReviewPage({ params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }) })
        renderWithProviders(page!)

        const optIn = screen.getByTestId('flag-optin')
        expect(optIn.querySelector('[data-testid="study-details"]')).toBeInTheDocument()
        expect(optIn.querySelector('[data-testid="code-only-view"]')).not.toBeInTheDocument()
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
