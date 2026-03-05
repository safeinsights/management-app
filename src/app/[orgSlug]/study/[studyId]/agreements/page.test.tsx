import { beforeEach, describe, it, expect, vi } from 'vitest'
import { redirect } from 'next/navigation'
import {
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
} from '@/tests/unit.helpers'
import { db } from '@/database'
import StudyAgreementsRoute from './page'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

let capturedProps: Record<string, unknown> = {}

vi.mock('./agreements-page', () => ({
    AgreementsPage: (props: Record<string, unknown>) => {
        capturedProps = props
        return <div data-testid="agreements-page" />
    },
}))

describe('StudyAgreementsRoute', () => {
    it('passes isReviewer=true and proceedHref containing /review for enclave reviewer with CODE-SUBMITTED job', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })

        const page = await StudyAgreementsRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })
        renderWithProviders(page!)

        expect(capturedProps.isReviewer).toBe(true)
        expect(capturedProps.proceedHref).toContain('/review')
    })

    it('redirects reviewer to review page when job status is not CODE-SCANNED or CODE-SUBMITTED', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'JOB-READY' })

        await expect(
            StudyAgreementsRoute({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            }),
        ).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/review'))
    })

    it('passes proceedHref containing /code for APPROVED researcher with no job activity', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        const page = await StudyAgreementsRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })
        renderWithProviders(page!)

        expect(capturedProps.isReviewer).toBe(false)
        expect(capturedProps.proceedHref).toContain('/code')
        expect(capturedProps.previousHref).toContain('/edit')
    })

    it('renders agreements for researcher with job activity, proceeding to /view', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        const page = await StudyAgreementsRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })
        renderWithProviders(page!)

        expect(capturedProps.proceedHref).toContain('/view')
        expect(capturedProps.proceedLabel).toBe('Back to Study Details')
        expect(capturedProps.previousHref).toBe(`/${org.slug}/dashboard`)
    })

    it('redirects researcher when study is not APPROVED and has no job activity', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await db.updateTable('study').set({ status: 'DRAFT' }).where('id', '=', study.id).execute()

        await expect(
            StudyAgreementsRoute({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            }),
        ).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/view'))
    })
})
