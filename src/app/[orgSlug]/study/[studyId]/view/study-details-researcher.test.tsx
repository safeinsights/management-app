import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { displayOrgName } from '@/lib/string'
import { setupStudyAction } from '@/tests/db-action.helpers'
import { StudyDetailsResearcher } from './study-details-researcher'

// OTTER-538 drops the "Study Code" section; OTTER-614 makes "Previous" walk back to /view/code.

describe('StudyDetailsResearcher', () => {
    it('omits the Study Code section', async () => {
        const { org, study, latestJob } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'lab' })

        renderWithProviders(<StudyDetailsResearcher orgSlug={org.slug} study={study} job={latestJob!} />)

        expect(screen.queryByText('Study Code')).not.toBeInTheDocument()
        expect(screen.getByText('Study Status')).toBeInTheDocument()
    })

    // OTTER-619: this screen shipped with no page header at all, so the h1 is asserted here.
    it('heads the page with the study title and the submitting lab, once', async () => {
        const { org, study, latestJob } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'lab' })

        renderWithProviders(<StudyDetailsResearcher orgSlug={org.slug} study={study} job={latestJob!} />)

        expect(screen.getByRole('heading', { level: 1, name: study.title! })).toBeInTheDocument()
        expect(screen.getByText(displayOrgName(org.name))).toBeInTheDocument()
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    })

    it('renders a Previous link back to the code step (/view/code)', async () => {
        const { org, study, latestJob } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'lab' })

        renderWithProviders(<StudyDetailsResearcher orgSlug={org.slug} study={study} job={latestJob!} />)

        expect(screen.getByRole('link', { name: /previous/i })).toHaveAttribute(
            'href',
            `/${org.slug}/study/${study.id}/view/code`,
        )
    })
})
