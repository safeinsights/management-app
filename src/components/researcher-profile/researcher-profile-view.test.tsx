import { describe, expect, it, pageHeaderEyebrow, renderWithProviders, screen } from '@/tests/unit.helpers'
import { ResearcherProfileLayout } from './researcher-profile-view'

// Category 3 (OTTER-619): no eyebrow, and the reserved slot must announce nothing.
describe('ResearcherProfileLayout', () => {
    it('heads the page with no eyebrow above it', () => {
        renderWithProviders(<ResearcherProfileLayout>{null}</ResearcherProfileLayout>)

        expect(screen.getByRole('heading', { level: 1, name: 'Researcher profile' })).toBeInTheDocument()
        expect(pageHeaderEyebrow()).toBe('')
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    })
})
