import { describe, expect, it, renderWithProviders, screen, userEvent, vi } from '@/tests/unit.helpers'
import { SUPPORT_EMAIL, SupportView } from './support-view'

describe('SupportView', () => {
    it('copies the email address and confirms it, with no mailto link', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        renderWithProviders(<SupportView />)

        expect(screen.getByRole('heading', { level: 1, name: 'Support' })).toBeInTheDocument()
        expect(screen.getByText(SUPPORT_EMAIL).closest('a')).toBeNull()
        expect(screen.queryByText('Copied')).toBeNull()

        await userEvent.click(screen.getByRole('button', { name: 'Copy email address' }))

        expect(writeText).toHaveBeenCalledWith(SUPPORT_EMAIL)
        expect(await screen.findByText('Copied')).toBeInTheDocument()
    })
})
