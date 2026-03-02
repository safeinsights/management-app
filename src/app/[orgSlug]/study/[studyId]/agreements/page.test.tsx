import { describe, it, expect, vi } from 'vitest'
import {
    insertTestStudyJobData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
} from '@/tests/unit.helpers'
import StudyAgreementsRoute from './page'

const mockRedirect = vi.fn()

vi.mock('next/navigation', () => ({
    redirect: (...args: unknown[]) => {
        mockRedirect(...args)
        throw new Error('NEXT_REDIRECT')
    },
}))

let capturedProps: Record<string, unknown> = {}

vi.mock('./agreements-page', () => ({
    AgreementsPage: (props: Record<string, unknown>) => {
        capturedProps = props
        return <div data-testid="agreements-page" />
    },
}))

vi.mock('@/components/page-breadcrumbs', () => ({
    OrgBreadcrumbs: () => <div data-testid="org-breadcrumbs" />,
    ResearcherBreadcrumbs: () => <div data-testid="researcher-breadcrumbs" />,
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
    })

    it('redirects researcher when study is not APPROVED', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, studyStatus: 'DRAFT' })

        await expect(
            StudyAgreementsRoute({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            }),
        ).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/view'))
    })
})
