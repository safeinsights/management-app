import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
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
})
