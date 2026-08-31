import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { CharacterCounter } from './character-counter'

// Mantine's `c` prop resolves to an inline `color` referencing a theme variable, so the
// over-limit state is read from there rather than from a class name.
const colorOf = (node: HTMLElement) => node.style.color

describe('CharacterCounter', () => {
    it('renders the count against the limit', () => {
        renderWithProviders(<CharacterCounter count={12} maxCharacters={60} />)
        expect(screen.getByText('12/60')).toBeInTheDocument()
    })

    it('stays dimmed at the limit', () => {
        renderWithProviders(<CharacterCounter count={60} maxCharacters={60} />)
        expect(colorOf(screen.getByText('60/60'))).toContain('dimmed')
    })

    it('turns red once the count passes the limit', () => {
        renderWithProviders(<CharacterCounter count={61} maxCharacters={60} />)
        expect(colorOf(screen.getByText('61/60'))).toContain('--mantine-color-error')
    })
})
