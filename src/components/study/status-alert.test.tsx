import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { STATUS_ALERT_SEPARATOR, StatusAlert, statusAlertTitle, type StatusAlertVariant } from './status-alert'

describe('statusAlertTitle', () => {
    it('appends the date after the separator', () => {
        expect(statusAlertTitle('Proposal approved', new Date('2026-04-20T10:00:00Z'))).toBe(
            `Proposal approved ${STATUS_ALERT_SEPARATOR} Apr 20, 2026`,
        )
    })

    it('leaves the title bare, separator included, when there is no date', () => {
        for (const missing of [null, undefined]) {
            expect(statusAlertTitle('Proposal approved', missing)).toBe('Proposal approved')
        }
    })
})

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

    // The banner colours are hand-transcribed Figma tokens sitting at the tail of their ramps, so a
    // ramp reorder would silently repaint a variant while data-variant assertions all still pass.
    it.each<[StatusAlertVariant, string, string]>([
        ['informative', '#EAE8FC', '#291BC4'],
        ['action', '#FFF9E5', '#5E4418'],
        ['success', '#E8F8EB', '#285831'],
        ['decline', '#FBECEB', '#7E241E'],
    ])('paints the %s variant from its library tokens', (variant, bg, accent) => {
        renderWithProviders(
            <StatusAlert variant={variant} title="Alert title">
                Body copy
            </StatusAlert>,
        )
        expect(getComputedStyle(screen.getByTestId('status-alert')).backgroundColor).toBe(bg)
        expect(getComputedStyle(screen.getByText('Alert title')).color).toBe(accent)
    })

    it('lets the icon inherit the accent rather than setting its own colour', () => {
        renderWithProviders(
            <StatusAlert variant="decline" title="Proposal declined">
                Body copy
            </StatusAlert>,
        )
        const icon = screen.getByTestId('status-alert').querySelector('.mantine-Alert-icon')
        expect(icon).not.toBeNull()
        expect(getComputedStyle(icon as Element).color).toBe('#7E241E')
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
        // Mantine's Alert defaults to role="alert", an implicitly assertive region.
        expect(alert).toHaveAttribute('role', 'status')
        expect(alert).toHaveAttribute('aria-atomic', 'true')
    })
})
