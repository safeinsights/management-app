import { beforeEach, describe, it, expect, vi } from 'vitest'
import { redirect, notFound } from 'next/navigation'
import { insertTestStudyJobData, mockSessionWithTestData, renderWithProviders } from '@/tests/unit.helpers'
import { db } from '@/database'
import StudyCodeUploadRoute from './page'

const mockRedirect = vi.mocked(redirect)
const mockNotFound = vi.mocked(notFound)

let capturedProps: Record<string, unknown> = {}

vi.mock('./code-upload', () => ({
    CodeUploadPage: (props: Record<string, unknown>) => {
        capturedProps = props
        return <div data-testid="code-upload-page" />
    },
}))

beforeEach(() => {
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
    mockNotFound.mockImplementation(() => {
        throw new Error('NEXT_NOT_FOUND')
    })
})

const renderRoute = async (orgSlug: string, studyId: string) => {
    const page = await StudyCodeUploadRoute({
        params: Promise.resolve({ orgSlug, studyId }),
    })
    renderWithProviders(page!)
}

describe('StudyCodeUploadRoute', () => {
    it('renders CodeUploadPage with correct props for DRAFT study', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'DRAFT',
        })

        await renderRoute(org.slug, study.id)

        expect(capturedProps.studyId).toBe(study.id)
        expect(capturedProps.language).toBe('R')
        expect(capturedProps.submittingOrgSlug).toBe(org.slug)
    })

    it('passes previousHref containing /edit for DRAFT study', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'DRAFT',
        })

        await renderRoute(org.slug, study.id)

        expect(capturedProps.previousHref).toContain('/edit')
    })

    it('passes previousHref containing /agreements for APPROVED study', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
        })

        await renderRoute(org.slug, study.id)

        expect(capturedProps.previousHref).toContain('/agreements')
    })

    it('calls notFound for non-DRAFT/APPROVED study', async () => {
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
        ).rejects.toThrow('NEXT_NOT_FOUND')

        expect(mockNotFound).toHaveBeenCalled()
    })

    it('passes existingMainFile and existingAdditionalFiles when studyJobFile records exist', async () => {
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

        expect(capturedProps.existingMainFile).toBe('main.R')
        expect(capturedProps.existingAdditionalFiles).toEqual(['helper.R'])
    })

    it('passes undefined existingMainFile and empty existingAdditionalFiles when no code files exist', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'DRAFT',
        })

        await renderRoute(org.slug, study.id)

        expect(capturedProps.existingMainFile).toBeUndefined()
        expect(capturedProps.existingAdditionalFiles).toEqual([])
    })
})
