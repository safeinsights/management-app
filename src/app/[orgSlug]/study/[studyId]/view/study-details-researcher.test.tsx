import { describe, expect, it } from 'vitest'
import type { Route } from 'next'
import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { displayOrgName } from '@/lib/string'
import { setupStudyAction } from '@/tests/db-action.helpers'
import type { StepNav } from '@/lib/study-screen'
import { StudyDetailsResearcher } from './study-details-researcher'

// Where "Previous step" points is resolveStepNav's business (pinned in lib/study-screen/nav.test.ts),
// so this file only checks that the view renders the nav it is handed.

const NAV: StepNav = {
    back: { label: 'Previous step', href: '/prev' as Route, variant: 'subtle', testId: 'cta-previous-step' },
}

describe('StudyDetailsResearcher', () => {
    it('omits the Study Code section', async () => {
        const { study, latestJob } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'lab' })

        renderWithProviders(<StudyDetailsResearcher study={study} job={latestJob!} nav={NAV} />)

        expect(screen.queryByText('Study Code')).not.toBeInTheDocument()
        expect(screen.getByText('Study Status')).toBeInTheDocument()
    })

    // OTTER-619: this screen shipped with no page header at all, so the h1 is asserted here.
    it('heads the page with the study title and the submitting lab, once', async () => {
        const { org, study, latestJob } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'lab' })

        renderWithProviders(<StudyDetailsResearcher study={study} job={latestJob!} nav={NAV} />)

        expect(screen.getByRole('heading', { level: 1, name: study.title! })).toBeInTheDocument()
        expect(screen.getByText(displayOrgName(org.name))).toBeInTheDocument()
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    })

    it('renders the step nav it is handed', async () => {
        const { study, latestJob } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'lab' })

        renderWithProviders(<StudyDetailsResearcher study={study} job={latestJob!} nav={NAV} />)

        expect(screen.getByTestId('cta-previous-step')).toHaveAttribute('href', '/prev')
    })
})
