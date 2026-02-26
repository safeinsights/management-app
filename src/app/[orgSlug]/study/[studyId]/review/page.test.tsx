import { describe, it, expect, vi } from 'vitest'
import {
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
} from '@/tests/unit.helpers'
import StudyReviewPage from './page'

vi.mock('./lab-review-view', () => ({
    LabReviewView: () => <div data-testid="lab-review-view" />,
}))

vi.mock('./enclave-review-view', () => ({
    EnclaveReviewView: () => <div data-testid="enclave-review-view" />,
}))

vi.mock('./proposal-review-view', () => ({
    ProposalReviewView: () => <div data-testid="proposal-review-view" />,
}))

vi.mock('./code-review-view', () => ({
    CodeReviewView: () => <div data-testid="code-review-view" />,
}))

vi.mock('@/components/openstax-feature-flag', () => ({
    OpenStaxFeatureFlag: ({
        defaultContent,
        optInContent,
    }: {
        defaultContent: React.ReactNode
        optInContent: React.ReactNode
    }) => (
        <>
            <div data-testid="flag-default">{defaultContent}</div>
            <div data-testid="flag-optin">{optInContent}</div>
        </>
    ),
}))

describe('StudyReviewPage', () => {
    it('renders LabReviewView for DRAFT study', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'DRAFT' })

        const page = await StudyReviewPage({ params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }) })
        renderWithProviders(page!)

        expect(screen.getByTestId('lab-review-view')).toBeInTheDocument()
    })

    it('renders EnclaveReviewView as default and ProposalReviewView as opt-in for non-feature-flag enclave org', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'APPROVED' })

        const page = await StudyReviewPage({ params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }) })
        renderWithProviders(page!)

        expect(
            screen.getByTestId('flag-default').querySelector('[data-testid="enclave-review-view"]'),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId('flag-optin').querySelector('[data-testid="proposal-review-view"]'),
        ).toBeInTheDocument()
    })

    it('renders CodeReviewView as opt-in for feature-flag enclave org with job', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'APPROVED' })

        const page = await StudyReviewPage({ params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }) })
        renderWithProviders(page!)

        expect(screen.getByTestId('flag-optin').querySelector('[data-testid="code-review-view"]')).toBeInTheDocument()
    })

    it('renders ProposalReviewView as opt-in for feature-flag enclave org without job', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await StudyReviewPage({ params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }) })
        renderWithProviders(page!)

        expect(
            screen.getByTestId('flag-optin').querySelector('[data-testid="proposal-review-view"]'),
        ).toBeInTheDocument()
    })
})
