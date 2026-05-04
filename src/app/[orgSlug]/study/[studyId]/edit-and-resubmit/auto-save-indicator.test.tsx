import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { AutoSaveIndicator } from './auto-save-indicator'

describe('AutoSaveIndicator', () => {
    it('shows the saving label while a save is in progress', () => {
        renderWithProviders(<AutoSaveIndicator isSaving={true} lastSavedAt={null} />)
        expect(screen.getByText(/saving progress/i)).toBeInTheDocument()
    })

    it('shows nothing when no save has happened yet and not saving', () => {
        renderWithProviders(<AutoSaveIndicator isSaving={false} lastSavedAt={null} />)
        expect(screen.queryByText(/saving progress/i)).not.toBeInTheDocument()
        expect(screen.queryByText(/last saved/i)).not.toBeInTheDocument()
    })

    it('shows "just now" right after a save', () => {
        renderWithProviders(<AutoSaveIndicator isSaving={false} lastSavedAt={new Date()} />)
        expect(screen.getByText(/last saved just now/i)).toBeInTheDocument()
    })

    it('shows minutes elapsed when more than a minute has passed', () => {
        const fiveMinAgo = new Date(Date.now() - 5 * 60_000)
        renderWithProviders(<AutoSaveIndicator isSaving={false} lastSavedAt={fiveMinAgo} />)
        expect(screen.getByText('Last saved 5 minutes ago')).toBeInTheDocument()
    })
})
