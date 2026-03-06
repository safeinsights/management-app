import { beforeEach, describe, it, expect, vi } from 'vitest'
import { redirect } from 'next/navigation'
import {
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
} from '@/tests/unit.helpers'
import StudyReviewPage from './page'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

// Async server component — RTL cannot render async components as JSX children
vi.mock('./code-review-view', () => ({
    CodeReviewView: () => <div data-testid="code-review-view" />,
}))

describe('StudyReviewPage', () => {
    it('redirects lab org to /view', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'DRAFT' })

        await expect(
            StudyReviewPage({ params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }) }),
        ).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/view'))
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
