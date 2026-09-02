import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { ResearcherProfileLayout } from './researcher-profile-view'

// Category 3 (OTTER-619): no eyebrow, and the reserved slot must announce nothing.
describe('ResearcherProfileLayout', () => {
    it('heads the page with no eyebrow above it', () => {
        renderWithProviders(<ResearcherProfileLayout>{null}</ResearcherProfileLayout>)

        const heading = screen.getByRole('heading', { level: 1, name: 'Researcher profile' })

        expect(heading.parentElement?.firstElementChild?.textContent).toBe('')
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    })
})
