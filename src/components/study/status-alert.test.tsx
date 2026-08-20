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

    it('renders the success view with its title and body (OTTER-696)', () => {
        renderWithProviders(
            <StatusAlert variant="success" title="All good">
                Nothing left to do
            </StatusAlert>,
        )
        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveAttribute('data-variant', 'success')
        expect(alert).toHaveTextContent('All good')
        expect(alert).toHaveTextContent('Nothing left to do')
    })

    it('stays a plain alert with no live region unless announcing is requested', () => {
        renderWithProviders(
            <StatusAlert variant="action" title="Action needed">
                Take action now
            </StatusAlert>,
        )
        expect(screen.getByTestId('status-alert')).not.toHaveAttribute('aria-live')
    })

    it('announces politely — never assertively — and atomically when asked to', () => {
        renderWithProviders(
            <StatusAlert variant="success" title="All good" announce>
                Nothing left to do
            </StatusAlert>,
        )
        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveAttribute('aria-live', 'polite')
        expect(alert).not.toHaveAttribute('aria-live', 'assertive')
        // Mantine's Alert defaults to role="alert", an implicitly ASSERTIVE region. Overriding it is
        // the point of the prop, so assert the role too rather than aria-live alone.
        expect(alert).toHaveAttribute('role', 'status')
        // Without this the swap announces the changed title only, not the body that explains it.
        expect(alert).toHaveAttribute('aria-atomic', 'true')
    })
})
