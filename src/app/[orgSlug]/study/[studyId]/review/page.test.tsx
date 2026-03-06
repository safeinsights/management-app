import { describe, it, expect, vi } from 'vitest'
import {
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
} from '@/tests/unit.helpers'
import StudyReviewPage from './page'

// Async server component — RTL cannot render async components as JSX children
vi.mock('./lab-review-view', () => ({
    LabReviewView: () => <div data-testid="lab-review-view" />,
}))

// Async server component — RTL cannot render async components as JSX children
vi.mock('./code-review-view', () => ({
    CodeReviewView: () => <div data-testid="code-review-view" />,
}))

describe('StudyReviewPage', () => {
    it('renders LabReviewView for lab org', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'DRAFT' })

        const page = await StudyReviewPage({ params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }) })
        renderWithProviders(page!)

        expect(screen.getByTestId('lab-review-view')).toBeInTheDocument()
    })

    it('renders CodeReviewView for enclave with code submitted', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })

        const page = await StudyReviewPage({ params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }) })
        renderWithProviders(page!)

        expect(screen.getByTestId('code-review-view')).toBeInTheDocument()
    })

    it('renders ProposalReviewView for enclave without code', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await StudyReviewPage({ params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }) })
        renderWithProviders(page!)

        expect(screen.getByText('Study request')).toBeInTheDocument()
    })
})
