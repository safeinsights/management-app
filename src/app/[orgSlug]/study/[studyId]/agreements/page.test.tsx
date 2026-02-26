import { describe, it, expect, vi } from 'vitest'
import { insertTestStudyJobData, mockSessionWithTestData, renderWithProviders } from '@/tests/unit.helpers'
import StudyAgreementsRoute from './page'

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
    it('passes isReviewer=true and proceedHref containing /review for enclave org reviewer', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        const page = await StudyAgreementsRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })
        renderWithProviders(page!)

        expect(capturedProps.isReviewer).toBe(true)
        expect(capturedProps.proceedHref).toContain('/review')
    })

    it('passes featureFlagProceedHref containing /code for feature-flag lab org submitter', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax-lab', orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        const page = await StudyAgreementsRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })
        renderWithProviders(page!)

        expect(capturedProps.isReviewer).toBe(false)
        expect(capturedProps.featureFlagProceedHref).toContain('/code')
    })

    it('passes featureFlagProceedHref as undefined for non-feature-flag org submitter', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        const page = await StudyAgreementsRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })
        renderWithProviders(page!)

        expect(capturedProps.isReviewer).toBe(false)
        expect(capturedProps.featureFlagProceedHref).toBeUndefined()
    })
})
