import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { SecurityKeyInput } from './security-key-input'

describe('SecurityKeyInput', () => {
    it('renders a textarea with autocomplete off', () => {
        renderWithProviders(<SecurityKeyInput />)
        expect(screen.getByRole('textbox')).toHaveAttribute('autocomplete', 'off')
    })

    it('marks the input as required', () => {
        renderWithProviders(<SecurityKeyInput />)
        expect(screen.getByRole('textbox')).toHaveAttribute('aria-required', 'true')
    })

    it('does not use aria-live', () => {
        renderWithProviders(<SecurityKeyInput />)
        expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-live')
    })

    it('forwards additional props', () => {
        renderWithProviders(<SecurityKeyInput placeholder="Paste your key" />)
        expect(screen.getByPlaceholderText('Paste your key')).toBeInTheDocument()
    })
})
