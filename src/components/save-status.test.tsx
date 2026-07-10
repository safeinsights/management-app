import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { theme } from '@/theme'
import { SaveStatusIndicator } from './save-status'

describe('SaveStatusIndicator', () => {
    it('renders nothing while idle', () => {
        renderWithProviders(<SaveStatusIndicator status="idle" />)
        expect(screen.queryByTestId('autosave-status')).not.toBeInTheDocument()
    })

    it('renders the saving label without a checkmark', () => {
        renderWithProviders(<SaveStatusIndicator status="saving" />)
        const status = screen.getByTestId('autosave-status')
        expect(status).toHaveTextContent('Saving…')
        expect(status.querySelector('svg')).not.toBeInTheDocument()
    })

    it('renders the saved label without a timestamp', () => {
        renderWithProviders(<SaveStatusIndicator status="saved" />)
        const status = screen.getByTestId('autosave-status')
        expect(status).toHaveTextContent('All changes saved')
        expect(status).not.toHaveTextContent(/\d/)
    })

    it('renders the saved label with a green checkmark', () => {
        renderWithProviders(<SaveStatusIndicator status="saved" />)
        const checkmark = screen.getByTestId('autosave-status').querySelector('svg')
        expect(checkmark).toBeInTheDocument()
        expect(checkmark).toHaveAttribute('fill', theme.colors!.green![9])
    })
})
