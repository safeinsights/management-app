import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { StudyScreenRenderer } from './study-screen-renderer'
import { SCREEN_COMPONENTS } from './registry'
import type { ScreenComponentProps } from './types'

const props = (screenId: string): ScreenComponentProps => ({
    descriptor: { screen: screenId as ScreenComponentProps['descriptor']['screen'] },
    study: {} as ScreenComponentProps['study'],
    raw: {
        status: 'DRAFT',
        approvedAt: null,
        rejectedAt: null,
        researcherAgreementsAckedAt: null,
        reviewerAgreementsAckedAt: null,
        language: null,
        proposalResubmissionNoteDraft: null,
        codeResubmissionNoteDraft: null,
        jobs: [],
    },
    orgSlug: 'lab',
    dashboardHref: '/dashboard',
})

describe('StudyScreenRenderer', () => {
    it('renders fallback when screen not registered', () => {
        renderWithProviders(<StudyScreenRenderer props={props('study-overview')} fallback={<div>LEGACY</div>} />)
        expect(screen.getByText('LEGACY')).toBeInTheDocument()
    })
    it('renders the registered component when present', () => {
        SCREEN_COMPONENTS['study-overview'] = () => <div>WIRED</div>
        renderWithProviders(<StudyScreenRenderer props={props('study-overview')} fallback={<div>LEGACY</div>} />)
        expect(screen.getByText('WIRED')).toBeInTheDocument()
        delete SCREEN_COMPONENTS['study-overview']
    })
})
