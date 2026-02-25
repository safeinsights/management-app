import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import {
    actionResult,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
} from '@/tests/unit.helpers'
import { describe, expect, it, vi } from 'vitest'
import { CodeReviewView } from './code-review-view'

vi.mock('@/components/page-breadcrumbs', () => ({
    OrgBreadcrumbs: () => <div data-testid="org-breadcrumbs" />,
}))

vi.mock('@/components/study/study-code-details', () => ({
    StudyCodeDetails: () => <div data-testid="study-code-details" />,
}))

vi.mock('@/components/study/study-details', () => ({
    StudyDetails: () => <div data-testid="study-details" />,
}))

vi.mock('./security-scan-panel', () => ({
    SecurityScanPanel: () => <div data-testid="security-scan-panel" />,
}))

vi.mock('./study-results', () => ({
    StudyResults: () => <div data-testid="study-results" />,
}))

vi.mock('./study-review-buttons', () => ({
    StudyReviewButtons: () => <div data-testid="study-review-buttons" />,
}))

describe('CodeReviewView', () => {
    let study: SelectedStudy

    const setupStudy = async (orgSlug: string) => {
        const { org, user } = await mockSessionWithTestData({ orgSlug, orgType: 'enclave' })
        const { study: dbStudy } = await insertTestStudyJobData({ org, researcherId: user.id })
        study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        return { org, orgSlug }
    }

    it('renders Study Code section', async () => {
        const { orgSlug } = await setupStudy('openstax')

        renderWithProviders(await CodeReviewView({ orgSlug, study }))

        expect(screen.getByTestId('study-code-details')).toBeInTheDocument()
    })

    it('does NOT render Study Proposal section', async () => {
        const { orgSlug } = await setupStudy('openstax')

        renderWithProviders(await CodeReviewView({ orgSlug, study }))

        expect(screen.queryByTestId('study-details')).not.toBeInTheDocument()
    })

    it('renders SecurityScanPanel and StudyResults', async () => {
        const { orgSlug } = await setupStudy('openstax')

        renderWithProviders(await CodeReviewView({ orgSlug, study }))

        expect(screen.getByTestId('security-scan-panel')).toBeInTheDocument()
        expect(screen.getByTestId('study-results')).toBeInTheDocument()
    })

    it('renders StudyReviewButtons', async () => {
        const { orgSlug } = await setupStudy('openstax')

        renderWithProviders(await CodeReviewView({ orgSlug, study }))

        expect(screen.getByTestId('study-review-buttons')).toBeInTheDocument()
    })

    it('renders Previous button linking to Agreements', async () => {
        const { orgSlug } = await setupStudy('openstax')

        renderWithProviders(await CodeReviewView({ orgSlug, study }))

        const previousButton = screen.getByRole('link', { name: /previous/i })
        expect(previousButton).toBeInTheDocument()
        expect(previousButton).toHaveAttribute('href', expect.stringContaining('/agreements'))
    })
})
