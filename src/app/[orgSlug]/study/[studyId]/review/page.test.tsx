import { beforeEach, describe, it, expect, vi } from 'vitest'
import { redirect, useParams } from 'next/navigation'
import {
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    type Mock,
} from '@/tests/unit.helpers'
import StudyReviewPage from './page'
import { CodeReviewView } from './code-review-view'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

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
        expect(page?.type).toBe(CodeReviewView)
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        renderWithProviders(await CodeReviewView(page!.props as Parameters<typeof CodeReviewView>[0]))

        expect(screen.getByText('Study Code')).toBeInTheDocument()
        expect(screen.getByText('Study Status')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /previous/i })).toHaveAttribute(
            'href',
            expect.stringContaining('/agreements'),
        )
    })

    it('renders ProposalReviewView for enclave without code', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await StudyReviewPage({ params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }) })
        renderWithProviders(page!)

        expect(screen.getByText('Study request')).toBeInTheDocument()
    })
})
