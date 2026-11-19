import { describedError, renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { describe, expect, it, vi } from 'vitest'
import { AcknowledgementCheckbox } from '../acknowledgement-checkbox'
import { Routes } from '@/lib/routes'
import { globalDocAgreementLabel, participationAgreementLabel } from './acknowledgement-checkbox'

const renderGlobalLabel = (documents: Parameters<typeof globalDocAgreementLabel>[0]) =>
    renderWithProviders(
        <AcknowledgementCheckbox label={globalDocAgreementLabel(documents)} checked={false} onChange={vi.fn()} />,
    )

describe('globalDocAgreementLabel', () => {
    // Links rather than inline text, so the signup page stays short.
    it.each([
        ['Terms of Service', Routes.termsOfService],
        ['Privacy Notice', Routes.privacyNotice],
    ])('links %s to its standalone page in a new tab', (name, href) => {
        renderGlobalLabel([])

        const link = screen.getByRole('link', { name })
        expect(link).toHaveAttribute('href', href)
        expect(link).toHaveAttribute('target', '_blank')
        expect(link.style.color).toBe('var(--si-color-link-default)')
    })

    it('names both documents before any is published, so the links still lead somewhere', () => {
        renderGlobalLabel([])

        expect(screen.getByLabelText('I agree to the Terms of Service and Privacy Notice.')).toBeInTheDocument()
    })

    it('names only what is published', () => {
        renderGlobalLabel([{ type: 'TOS', versionId: 'tos-v1', format: 'markdown', content: '# Terms' }])

        expect(screen.getByLabelText('I agree to the Terms of Service.')).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'Privacy Notice' })).not.toBeInTheDocument()
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

    it('takes the selected blue and the small radius from the theme', () => {
        renderWithProviders(<AcknowledgementCheckbox label="I agree" checked={true} onChange={vi.fn()} />)

        const root = screen.getByRole('checkbox').closest<HTMLElement>('.mantine-Checkbox-root')
        expect(root?.style.getPropertyValue('--checkbox-color')).toBe('var(--si-color-surface-selected)')
        expect(root?.style.getPropertyValue('--checkbox-radius')).toBe('var(--mantine-radius-xs)')
    })

    it('shows its error with the error icon and points the checkbox at it', () => {
        renderWithProviders(
            <AcknowledgementCheckbox label="I agree" checked={false} onChange={vi.fn()} error="Agree to continue." />,
        )

        const checkbox = screen.getByRole('checkbox')
        expect(checkbox).toHaveAttribute('aria-invalid', 'true')
        expect(describedError(checkbox)).toHaveTextContent('Agree to continue.')
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
            expect(link).toHaveAttribute('target', '_blank')
        })

        it('lets the agreement name wrap so the form fits a phone', () => {
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
            expect(link).not.toHaveClass('nowrap')
        })

        it('ends the label with a full stop and shows the link underlined, without the new-tab icon', () => {
            renderWithProviders(
                <AcknowledgementCheckbox
                    label={participationAgreementLabel({
                        versionId: 'dopa-v1',
                        type: 'DOPA',
                        url: 'https://example.com/agreement.pdf',
                    })}
                    checked={false}
                    onChange={vi.fn()}
                />,
            )

            expect(
                screen.getByLabelText('I agree to the Data Organization Participation Agreement.'),
            ).toBeInTheDocument()
            const link = screen.getByRole('link', { name: 'Data Organization Participation Agreement' })
            expect(link).toHaveAttribute('data-underline', 'always')
            expect(link.querySelector('svg')).toBeNull()
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

        it('names both documents in the agreement label', () => {
            renderWithProviders(
                <AcknowledgementCheckbox
                    label={globalDocAgreementLabel(documents)}
                    checked={false}
                    onChange={vi.fn()}
                />,
            )

            expect(screen.getByLabelText('I agree to the Terms of Service and Privacy Notice.')).toBeInTheDocument()
        })
    })
})
