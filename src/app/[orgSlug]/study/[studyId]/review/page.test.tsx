import { beforeEach, describe, it, expect, vi } from 'vitest'
import { redirect, useParams } from 'next/navigation'
import {
    db,
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    type Mock,
} from '@/tests/unit.helpers'
import StudyReviewPage from './page'
import { CodeReviewView } from './code-review-view'
import { ProposalReviewView } from './proposal-review-view'

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
            StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: Promise.resolve({}),
            }),
        ).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/view'))
    })

    it('redirects enclave to agreements page when code submitted and not coming from agreements', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })

        await expect(
            StudyReviewPage({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
                searchParams: Promise.resolve({}),
            }),
        ).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/agreements'))
    })

    it('renders CodeReviewView for enclave with code submitted when coming from agreements', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({ from: 'agreements-proceed' }),
        })
        expect(page?.type).toBe(CodeReviewView)
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        renderWithProviders(await CodeReviewView(page!.props as Parameters<typeof CodeReviewView>[0]))

        expect(screen.getByText('Study Code')).toBeInTheDocument()
        expect(screen.getByText('Study Status')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /previous/i })).toHaveAttribute(
            'href',
            expect.stringContaining('/review?from=agreements'),
        )
    })

    it('renders ProposalReviewView with agreementsHref when from=agreements and code submitted', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({ from: 'agreements' }),
        })
        expect(page?.type).toBe(ProposalReviewView)
        expect(page?.props.agreementsHref).toContain('/agreements')
    })

    it('renders CodeReviewView directly when agreements already acknowledged (no redirect)', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
            jobStatus: 'CODE-SUBMITTED',
        })

        await db
            .updateTable('study')
            .set({ reviewerAgreementsAckedAt: new Date() })
            .where('id', '=', study.id)
            .execute()

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({}),
        })
        expect(page?.type).toBe(CodeReviewView)
        expect(mockRedirect).not.toHaveBeenCalled()
    })

    it('renders ProposalReviewView for enclave without code', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await StudyReviewPage({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            searchParams: Promise.resolve({}),
        })
        renderWithProviders(page!)

        expect(screen.getByText('Review Study')).toBeInTheDocument()
    })
})
