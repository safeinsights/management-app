import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
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
})
