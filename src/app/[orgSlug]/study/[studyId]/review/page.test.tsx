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

vi.mock('./proposal-review-view', () => ({
    ProposalReviewView: () => <div data-testid="proposal-review-view" />,
}))

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

        expect(screen.getByTestId('proposal-review-view')).toBeInTheDocument()
    })
})
