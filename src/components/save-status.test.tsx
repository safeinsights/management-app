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

    it('renders nothing when hidden, even in the saved state (OTTER-674)', () => {
        renderWithProviders(<SaveStatusIndicator status="saved" isVisible={false} />)
        expect(screen.queryByTestId('autosave-status')).not.toBeInTheDocument()
    })

    it('announces "All changes saved" from a polite live region (OTTER-675)', () => {
        renderWithProviders(<SaveStatusIndicator status="saved" />)
        const region = screen.getByRole('status')
        expect(region).toHaveAttribute('aria-live', 'polite')
        expect(region).toHaveAttribute('aria-atomic', 'true')
        expect(region).toHaveTextContent('All changes saved')
    })

    it('keeps the live region mounted and empty while idle, so the save is announced (OTTER-675)', () => {
        // A live region is only announced when content it already owns changes, so the region
        // has to be in the DOM before the label lands in it.
        renderWithProviders(<SaveStatusIndicator status="idle" />)
        expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    it('leaves the transient saving label out of the live region (OTTER-675)', () => {
        renderWithProviders(<SaveStatusIndicator status="saving" />)
        expect(screen.getByTestId('autosave-status').closest('[aria-live]')).toBeNull()
        expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    it('empties the live region when hidden by a validation error (OTTER-674)', () => {
        renderWithProviders(<SaveStatusIndicator status="saved" isVisible={false} />)
        expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })
})
