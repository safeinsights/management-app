import { describe, expect, it, renderWithProviders, screen, vi } from '@/tests/unit.helpers'
import { AppModal } from './app-modal'

describe('AppModal', () => {
    it('names the close button', () => {
        renderWithProviders(
            <AppModal isOpen onClose={vi.fn()} title="Details">
                Body
            </AppModal>,
        )

        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    })

    it('keeps a caller-supplied name for the close button', () => {
        renderWithProviders(
            <AppModal isOpen onClose={vi.fn()} title="Details" closeButtonProps={{ 'aria-label': 'Dismiss' }}>
                Body
            </AppModal>,
        )

        expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    })
})
