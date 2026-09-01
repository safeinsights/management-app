import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { theme } from '@/theme'
import { SaveStatusAnnouncer, SaveStatusIndicator, announcedSaveStatus } from './save-status'

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

    it('leaves the live region unnamed, so the name is not spoken ahead of the save (OTTER-675)', () => {
        renderWithProviders(<SaveStatusIndicator status="saved" />)
        const region = screen.getByTestId('autosave-live-region')
        expect(region).not.toHaveAttribute('aria-label')
        expect(region).not.toHaveAttribute('aria-labelledby')
    })

    it('drops its own live region when announce is false, keeping the visible label (OTTER-675)', () => {
        renderWithProviders(<SaveStatusIndicator status="saved" announce={false} />)
        expect(screen.getByTestId('autosave-status')).toHaveTextContent('All changes saved')
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
        expect(screen.getByTestId('autosave-status').closest('[aria-live]')).toBeNull()
    })
})

describe('SaveStatusAnnouncer', () => {
    it('announces the save from a polite, atomic region', () => {
        renderWithProviders(<SaveStatusAnnouncer status="saved" />)
        const region = screen.getByRole('status')
        expect(region).toHaveAttribute('aria-live', 'polite')
        expect(region).toHaveAttribute('aria-atomic', 'true')
        expect(region).toHaveTextContent('All changes saved')
    })

    it('stays mounted and empty until a save lands', () => {
        renderWithProviders(<SaveStatusAnnouncer status="saving" />)
        expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })
})

describe('announcedSaveStatus', () => {
    it('announces once when any field of a shared save source is saved', () => {
        expect(announcedSaveStatus(['idle', 'saved', 'idle'])).toBe('saved')
    })

    it('stays idle while no field is showing a save', () => {
        expect(announcedSaveStatus(['idle', 'saving', 'idle'])).toBe('idle')
        expect(announcedSaveStatus([])).toBe('idle')
    })
})
