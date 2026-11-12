import { describe, expect, it, renderWithProviders, screen, userEvent, vi, waitFor } from '@/tests/unit.helpers'
import { SUPPORT_EMAIL, SupportView } from './support-view'

describe('SupportView', () => {
    it('copies the email address and confirms it, with no mailto link', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        renderWithProviders(<SupportView />)

        expect(screen.getByRole('heading', { level: 1, name: 'Support' })).toBeInTheDocument()
        expect(screen.getByText(/Please don’t hesitate to email SafeInsights at/)).toBeInTheDocument()
        expect(screen.getByText(/Please don’t hesitate to email SafeInsights at/).textContent).toContain(SUPPORT_EMAIL)
        expect(screen.queryByRole('link')).toBeNull()
        expect(screen.getByText('Copied')).toHaveClass('invisible')

        await userEvent.click(screen.getByRole('button', { name: 'Copy email address' }))

        expect(writeText).toHaveBeenCalledWith(SUPPORT_EMAIL)
        await waitFor(() => expect(screen.getByText('Copied')).not.toHaveClass('invisible'))
    })
})
