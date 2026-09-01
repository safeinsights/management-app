import { describe, expect, it, renderWithProviders, vi } from '@/tests/unit.helpers'
import { DatasetMultiSelect } from './dataset-multi-select'

describe('DatasetMultiSelect', () => {
    const renderField = (placeholder?: string) =>
        renderWithProviders(
            <DatasetMultiSelect id="datasets" value={[]} onChange={vi.fn()} placeholder={placeholder} />,
        )

    it('keeps the empty field visible when the caller asks for no placeholder text', () => {
        const { container } = renderField('')

        const field = container.querySelector('input#datasets')
        expect(field).not.toBeNull()
        expect(field).not.toHaveAttribute('data-type', 'hidden')
    })

    it('renders no visible placeholder text when the caller asks for none', () => {
        const { container } = renderField('')

        expect(container.querySelector('input#datasets')?.getAttribute('placeholder')?.trim()).toBe('')
    })

    it('still shows the placeholder a caller does supply', () => {
        const { container } = renderField('Select dataset(s) of interest')

        const field = container.querySelector('input#datasets')
        expect(field).toHaveAttribute('placeholder', 'Select dataset(s) of interest')
        expect(field).not.toHaveAttribute('data-type', 'hidden')
    })
})
