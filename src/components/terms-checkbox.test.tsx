import { renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { describe, expect, it, vi } from 'vitest'
import { TermsCheckbox } from './terms-checkbox'

describe('TermsCheckbox', () => {
    it('renders unchecked by default', () => {
        renderWithProviders(<TermsCheckbox checked={false} onChange={vi.fn()} />)
        expect(screen.getByRole('checkbox')).not.toBeChecked()
    })

    it('calls onChange when clicked', async () => {
        const onChange = vi.fn()
        const user = userEvent.setup()
        renderWithProviders(<TermsCheckbox checked={false} onChange={onChange} />)

        await user.click(screen.getByRole('checkbox'))
        expect(onChange).toHaveBeenCalledWith(true)
    })

    it('shows Terms of Service popover when clicked', async () => {
        const user = userEvent.setup()
        renderWithProviders(<TermsCheckbox checked={false} onChange={vi.fn()} />)

        await user.click(screen.getByText('Terms of Service'))
        expect(
            screen.getByText(/Once implemented, SafeInsights Terms of Service will detail acceptable use/),
        ).toBeInTheDocument()
    })

    it('shows Privacy Notice popover when clicked', async () => {
        const user = userEvent.setup()
        renderWithProviders(<TermsCheckbox checked={false} onChange={vi.fn()} />)

        await user.click(screen.getByText('Privacy Notice'))
        expect(
            screen.getByText(/Once implemented, SafeInsights Privacy Notice will detail the ways/),
        ).toBeInTheDocument()
    })
})
