import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { RequiredIndicator } from './required-indicator'

describe('RequiredIndicator', () => {
    it('paints the asterisk with the design color and names the requirement', () => {
        renderWithProviders(<RequiredIndicator />)

        const indicator = screen.getByLabelText('required')

        expect(indicator).toHaveTextContent('*')
        // The token var is what lands inline; it resolves to red.7 via error.text.
        expect(indicator.getAttribute('style') || '').toContain('--si-color-error-text')
    })

    it('renders nothing for a field that is not required', () => {
        renderWithProviders(<RequiredIndicator isVisible={false} />)

        expect(screen.queryByLabelText('required')).toBeNull()
    })
})
