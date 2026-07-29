import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SecurityKeyForm } from './security-key-form'

describe('SecurityKeyForm', () => {
    it('renders the header with a required indicator', () => {
        renderWithProviders(<SecurityKeyForm />)
        expect(screen.getByRole('heading', { name: /security key/i })).toBeInTheDocument()
        expect(screen.getByLabelText('required')).toHaveTextContent('*')
    })

    it('renders the body copy', () => {
        renderWithProviders(<SecurityKeyForm />)
        expect(
            screen.getByText('This key is required to access the outputs. It was issued to you during sign-up.'),
        ).toBeInTheDocument()
    })

    it('renders the input with autocomplete off', () => {
        renderWithProviders(<SecurityKeyForm />)
        expect(screen.getByRole('textbox')).toHaveAttribute('autocomplete', 'off')
    })

    it('renders the View button', () => {
        renderWithProviders(<SecurityKeyForm />)
        expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument()
    })

    it('renders the Lost your key? trigger', () => {
        renderWithProviders(<SecurityKeyForm />)
        expect(screen.getByRole('button', { name: /lost your key/i })).toBeInTheDocument()
    })

    it('opens the popover on click and shows the help text', async () => {
        renderWithProviders(<SecurityKeyForm />)
        await userEvent.click(screen.getByRole('button', { name: /lost your key/i }))

        expect(screen.getByText(/another member of your organization/i)).toBeInTheDocument()
        expect(screen.getByText(/a key you generate now cannot access/i)).toBeInTheDocument()
    })

    it('dismisses the popover on outside click', async () => {
        renderWithProviders(<SecurityKeyForm />)
        const trigger = screen.getByRole('button', { name: /lost your key/i })

        await userEvent.click(trigger)
        expect(trigger).toHaveAttribute('aria-expanded', 'true')

        fireEvent.mouseDown(document.body)
        expect(trigger).toHaveAttribute('aria-expanded', 'false')
    })

    it('includes a link to the security key management page', async () => {
        renderWithProviders(<SecurityKeyForm />)
        await userEvent.click(screen.getByRole('button', { name: /lost your key/i }))

        const link = screen.getByRole('link', { name: /manage your security key/i, hidden: true })
        expect(link).toHaveAttribute('href', '/user-key')
        expect(link).toHaveAttribute('target', '_blank')
    })
})
