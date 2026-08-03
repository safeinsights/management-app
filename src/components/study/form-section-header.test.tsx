import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { FormSectionHeader } from './form-section-header'

describe('FormSectionHeader', () => {
    it('renders a semantic heading with the title', () => {
        renderWithProviders(<FormSectionHeader title="Security key" description="Some description" />)
        expect(screen.getByRole('heading', { name: /security key/i })).toBeInTheDocument()
    })

    it('renders the description and a divider', () => {
        renderWithProviders(<FormSectionHeader title="Title" description="Body text here" />)
        expect(screen.getByText('Body text here')).toBeInTheDocument()
        expect(screen.getByRole('separator')).toBeInTheDocument()
    })

    it('shows a required indicator with an accessible label when required', () => {
        renderWithProviders(<FormSectionHeader title="Title" description="Desc" required />)
        const indicator = screen.getByLabelText('required')
        expect(indicator).toHaveTextContent('*')
    })

    it('omits the required indicator when not required', () => {
        renderWithProviders(<FormSectionHeader title="Title" description="Desc" />)
        expect(screen.queryByLabelText('required')).toBeNull()
    })
})
