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

    describe('once documents have been published', () => {
        const documents = [
            { type: 'TOS' as const, versionId: 'tos-v1', content: '# Terms\n\nThe real terms.' },
            { type: 'PN' as const, versionId: 'pn-v1', content: '# Privacy\n\nThe real notice.' },
        ]

        it('renders the documents instead of the placeholder copy', () => {
            renderWithProviders(<TermsCheckbox checked={false} onChange={vi.fn()} documents={documents} />)

            expect(screen.getByText('The real terms.')).toBeInTheDocument()
            expect(screen.getByText('The real notice.')).toBeInTheDocument()
            expect(screen.queryByText(/Once implemented/)).not.toBeInTheDocument()
        })

        it('names both documents in the agreement label', () => {
            renderWithProviders(<TermsCheckbox checked={false} onChange={vi.fn()} documents={documents} />)

            expect(screen.getByLabelText('I agree to the Terms of Service and Privacy Notice')).toBeInTheDocument()
        })
    })
})
