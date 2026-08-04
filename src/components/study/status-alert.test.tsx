import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { StatusAlert } from './status-alert'

describe('StatusAlert', () => {
    it('renders the informative view with its title and body', () => {
        renderWithProviders(
            <StatusAlert variant="informative" title="Heads up">
                Body copy
            </StatusAlert>,
        )
        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveAttribute('data-variant', 'informative')
        expect(alert).toHaveTextContent('Heads up')
        expect(alert).toHaveTextContent('Body copy')
    })

    it('renders the action view when the variant switches', () => {
        renderWithProviders(
            <StatusAlert variant="action" title="Action needed">
                Take action now
            </StatusAlert>,
        )
        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveAttribute('data-variant', 'action')
        expect(alert).toHaveTextContent('Action needed')
        expect(alert).toHaveTextContent('Take action now')
    })
})
