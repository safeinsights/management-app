import { beforeEach, describe, it, expect, vi } from 'vitest'
import { redirect } from 'next/navigation'
import {
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    waitFor,
} from '@/tests/unit.helpers'
import { db } from '@/database'
import { StudyRequestProvider } from '@/contexts/study-request'
import { memoryRouter } from 'next-router-mock'
import StudyCodeUploadRoute from './page'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    memoryRouter.setCurrentUrl('/')
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

const renderRoute = async (orgSlug: string, studyId: string) => {
    const page = await StudyCodeUploadRoute({
        params: Promise.resolve({ orgSlug, studyId }),
    })
    renderWithProviders(<StudyRequestProvider submittingOrgSlug={orgSlug}>{page!}</StudyRequestProvider>)
}

describe('StudyCodeUploadRoute', () => {
    it('renders code upload page for DRAFT study and previous links to edit', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'DRAFT',
        })

        await renderRoute(org.slug, study.id)

        expect(screen.getByRole('heading', { name: /upload your study code/i })).toBeInTheDocument()
        expect(screen.getByText('STEP 4 of 4')).toBeInTheDocument()

        const previousLink = screen.getByRole('link', { name: /previous/i })
        expect(previousLink).toHaveAttribute('href', expect.stringContaining('/edit'))
    })

    it('routes approved study previous button to agreements', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
        })

        await renderRoute(org.slug, study.id)

        const previousLink = screen.getByRole('link', { name: /previous/i })
        expect(previousLink).toHaveAttribute('href', expect.stringContaining('/agreements'))
    })

    it('redirects to view for non-DRAFT/APPROVED study', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
        })
        await db.updateTable('study').set({ status: 'PENDING-REVIEW' }).where('id', '=', study.id).execute()

        await expect(
            StudyCodeUploadRoute({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            }),
        ).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/view'))
    })

    it('enables submit when existing code files are present', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'DRAFT',
        })

        await db
            .insertInto('studyJobFile')
            .values([
                { studyJobId: job.id, name: 'main.R', path: '/code/main.R', fileType: 'MAIN-CODE', sourceId: null },
                {
                    studyJobId: job.id,
                    name: 'helper.R',
                    path: '/code/helper.R',
                    fileType: 'SUPPLEMENTAL-CODE',
                    sourceId: null,
                },
            ])
            .execute()

        await renderRoute(org.slug, study.id)

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /submit code/i })).toBeEnabled()
        })
    })

    it('keeps submit disabled when no code files exist', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'DRAFT',
        })

        await renderRoute(org.slug, study.id)

        expect(screen.getByRole('button', { name: /submit code/i })).toBeDisabled()
    })
})
