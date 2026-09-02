import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { ManageTeamView } from './manage-team-view'

// Category 2 (OTTER-619): the eyebrow names the org whose page this is, the h1 names the page.
describe('ManageTeamView', () => {
    it('heads the page with the org name above the page title, once', () => {
        renderWithProviders(<ManageTeamView orgName="Genius" inviteAction={null} table={null} />)

        const heading = screen.getByRole('heading', { level: 1, name: 'Manage team' })

        expect(heading).toBeInTheDocument()
        expect(heading.parentElement?.firstElementChild?.textContent).toBe('Genius')
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    })
})
