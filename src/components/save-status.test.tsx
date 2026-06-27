import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { SaveStatusIndicator } from './save-status'

describe('SaveStatusIndicator', () => {
    it('renders nothing while idle', () => {
        renderWithProviders(<SaveStatusIndicator status="idle" />)
        expect(screen.queryByTestId('autosave-status')).not.toBeInTheDocument()
    })

    it('renders the saving label', () => {
        renderWithProviders(<SaveStatusIndicator status="saving" />)
        expect(screen.getByTestId('autosave-status')).toHaveTextContent('Saving…')
    })

    it('renders the saved label without a timestamp', () => {
        renderWithProviders(<SaveStatusIndicator status="saved" />)
        const status = screen.getByTestId('autosave-status')
        expect(status).toHaveTextContent('All changes saved')
        expect(status).not.toHaveTextContent(/\d/)
    })
})
