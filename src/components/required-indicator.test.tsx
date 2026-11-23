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

    // OTTER-662: a bare asterisk fell back to Mantine's 16px regular beside a 14px semibold label.
    it('takes its font size and weight from the label it sits in', () => {
        renderWithProviders(<RequiredIndicator />)

        expect(screen.getByLabelText('required')).toHaveAttribute('data-inherit')
    })

    it('renders nothing for a field that is not required', () => {
        renderWithProviders(<RequiredIndicator isVisible={false} />)

        expect(screen.queryByLabelText('required')).toBeNull()
    })
})
