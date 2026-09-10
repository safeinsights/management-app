import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { RequiredIndicator } from './required-indicator'

describe('RequiredIndicator', () => {
    it('paints the asterisk with the design color and names the requirement', () => {
        renderWithProviders(<RequiredIndicator />)

        const indicator = screen.getByLabelText('required')

        expect(indicator).toHaveTextContent('*')
        // Mantine maps `c` to an inline CSS variable, so the resolved color is not assertable.
        expect(indicator.getAttribute('style') || '').toContain('--mantine-color-red-10')
    })

    it('renders nothing for a field that is not required', () => {
        renderWithProviders(<RequiredIndicator isVisible={false} />)

        expect(screen.queryByLabelText('required')).toBeNull()
    })
})
