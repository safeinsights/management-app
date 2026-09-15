import { describe, expect, it, renderWithProviders, screen, within } from '@/tests/unit.helpers'
import { ReadOnlyField } from './read-only-field'

describe('ReadOnlyField', () => {
    it('renders the label and the value', () => {
        renderWithProviders(<ReadOnlyField label="Data Partner" value="OpenStax" />)

        expect(screen.getByText('Data Partner')).toBeInTheDocument()
        expect(screen.getByText('OpenStax')).toBeInTheDocument()
    })

    it('renders no editable control and no required marker', () => {
        renderWithProviders(<ReadOnlyField label="Programming language" value="Python" />)

        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
        expect(screen.queryByLabelText('required')).not.toBeInTheDocument()
    })

    it('names the field after its label, so the value is never announced on its own', () => {
        renderWithProviders(<ReadOnlyField label="Data Partner" value="OpenStax" />)

        const field = screen.getByRole('group', { name: 'Data Partner' })
        expect(within(field).getByText('OpenStax')).toBeInTheDocument()
    })

    it('marks the field unavailable and keeps it out of the tab order', () => {
        renderWithProviders(<ReadOnlyField label="Data Partner" value="OpenStax" />)

        const field = screen.getByRole('group', { name: 'Data Partner' })
        expect(field).toHaveAttribute('aria-disabled', 'true')
        expect(field).toHaveAttribute('tabindex', '-1')
    })

    it('gives each field its own name when several render together', () => {
        renderWithProviders(
            <>
                <ReadOnlyField label="Data Partner" value="OpenStax" />
                <ReadOnlyField label="Programming language" value="R" />
            </>,
        )

        expect(within(screen.getByRole('group', { name: 'Data Partner' })).getByText('OpenStax')).toBeInTheDocument()
        expect(within(screen.getByRole('group', { name: 'Programming language' })).getByText('R')).toBeInTheDocument()
    })
})
