import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { setupStudyAction } from '@/tests/db-action.helpers'
import { StudyDetailsRedesignView } from './study-details-redesign-view'

// OTTER-538: the RL Study Details redesign drops the "Study Code" section
// entirely and shows only Study Status + Previous.

describe('StudyDetailsRedesignView (RL)', () => {
    it('omits the Study Code section', async () => {
        const { org, study, latestJob } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'lab' })

        renderWithProviders(<StudyDetailsRedesignView orgSlug={org.slug} study={study} job={latestJob!} />)

        expect(screen.queryByText('Study Code')).not.toBeInTheDocument()
        expect(screen.getByText('Study Status')).toBeInTheDocument()
    })

    it('renders a Previous link', async () => {
        const { org, study, latestJob } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'lab' })

        renderWithProviders(<StudyDetailsRedesignView orgSlug={org.slug} study={study} job={latestJob!} />)

        const previous = screen.getByRole('link', { name: /previous/i })
        expect(previous).toBeInTheDocument()
    })
})
