import { renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { describe, expect, it, vi } from 'vitest'
import {
    AcknowledgementCheckbox,
    globalDocAgreementLabel,
    participationAgreementLabel,
    TosPnPreview,
} from './acknowledgement-checkbox'

describe('Placeholders', () => {
    it('shows Terms of Service popover when clicked', async () => {
        const user = userEvent.setup()
        renderWithProviders(
            <AcknowledgementCheckbox label={globalDocAgreementLabel([])} checked={false} onChange={vi.fn()} />,
        )

        await user.click(screen.getByText('Terms of Service'))
        expect(
            screen.getByText(/Once implemented, SafeInsights Terms of Service will detail acceptable use/),
        ).toBeInTheDocument()
    })

    it('shows Privacy Notice popover when clicked', async () => {
        const user = userEvent.setup()
        renderWithProviders(
            <AcknowledgementCheckbox label={globalDocAgreementLabel([])} checked={false} onChange={vi.fn()} />,
        )

        await user.click(screen.getByText('Privacy Notice'))
        expect(
            screen.getByText(/Once implemented, SafeInsights Privacy Notice will detail the ways/),
        ).toBeInTheDocument()
    })
})

describe('AcknowledgementCheckbox', () => {
    it('renders unchecked by default', () => {
        renderWithProviders(<AcknowledgementCheckbox label="I agree" checked={false} onChange={vi.fn()} />)
        expect(screen.getByRole('checkbox')).not.toBeChecked()
    })

    it('calls onChange when clicked', async () => {
        const onChange = vi.fn()
        const user = userEvent.setup()
        renderWithProviders(<AcknowledgementCheckbox label="I agree" checked={false} onChange={onChange} />)

        await user.click(screen.getByRole('checkbox'))
        expect(onChange).toHaveBeenCalledWith(true)
    })

    // No label means there is nothing to agree to — an org with no participation agreement, say — so
    // the checkbox is not rendered at all rather than shown against empty copy.
    it('renders no checkbox when there is no label', () => {
        renderWithProviders(<AcknowledgementCheckbox label={null} checked={false} onChange={vi.fn()} />)
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    })

    describe('participationAgreementLabel', () => {
        it('links to the participation agreement pdf by its type name', () => {
            renderWithProviders(
                <AcknowledgementCheckbox
                    label={participationAgreementLabel({
                        versionId: 'ropa-v1',
                        type: 'ROPA',
                        url: 'https://example.com/agreement.pdf',
                    })}
                    checked={false}
                    onChange={vi.fn()}
                />,
            )

            const link = screen.getByRole('link', { name: 'Research Organization Participation Agreement' })
            expect(link).toHaveAttribute('href', 'https://example.com/agreement.pdf')
        })

        // Nothing published yet: no agreement to link or agree to, so the checkbox drops out.
        it('renders no checkbox when there is no agreement', () => {
            renderWithProviders(
                <AcknowledgementCheckbox
                    label={participationAgreementLabel(null)}
                    checked={false}
                    onChange={vi.fn()}
                />,
            )
            expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
        })
    })
    describe('once documents have been published', () => {
        const documents = [
            {
                type: 'TOS' as const,
                versionId: 'tos-v1',
                format: 'markdown' as const,
                content: '# Terms\n\nThe real terms.',
            },
            {
                type: 'PN' as const,
                versionId: 'pn-v1',
                format: 'markdown' as const,
                content: '# Privacy\n\nThe real notice.',
            },
        ]

        it('renders the documents', () => {
            renderWithProviders(<TosPnPreview documents={documents} />)

            expect(screen.getByText('The real terms.')).toBeInTheDocument()
            expect(screen.getByText('The real notice.')).toBeInTheDocument()
            expect(screen.queryByText(/Once implemented/)).not.toBeInTheDocument()
        })

        it('names both documents in the agreement label', () => {
            renderWithProviders(
                <AcknowledgementCheckbox
                    label={globalDocAgreementLabel(documents)}
                    checked={false}
                    onChange={vi.fn()}
                />,
            )

            expect(screen.getByLabelText('I agree to the Terms of Service and Privacy Notice')).toBeInTheDocument()
        })
    })
})
