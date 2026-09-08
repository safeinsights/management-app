import { describe, expect, it, renderWithProviders, screen, userEvent, vi } from '@/tests/unit.helpers'
import { SecurityKeyViewButton } from './security-key-view-button'

describe('SecurityKeyViewButton', () => {
    it('is enabled and labelled "View" when idle, and fires onClick', async () => {
        const onClick = vi.fn()
        renderWithProviders(<SecurityKeyViewButton isDecrypting={false} onClick={onClick} />)

        const button = screen.getByRole('button', { name: 'View' })
        expect(button).toBeEnabled()

        await userEvent.click(button)
        expect(onClick).toHaveBeenCalledOnce()
    })

    it('shows a disabled Decrypting button with a loader and announces it politely', () => {
        renderWithProviders(<SecurityKeyViewButton isDecrypting onClick={vi.fn()} />)

        expect(screen.getByRole('button', { name: /decrypting/i })).toBeDisabled()

        const status = screen.getByRole('status')
        expect(status).toHaveAttribute('aria-live', 'polite')
        expect(status).toHaveTextContent('Decrypting outputs')
    })
})
