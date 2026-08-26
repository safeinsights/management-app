import { describe, expect, it, renderWithProviders, vi } from '@/tests/unit.helpers'
import { DatasetMultiSelect } from './dataset-multi-select'

/**
 * Guards the placeholder-free rendering Step 2 asks for (OTTER-691).
 *
 * Mantine types this MultiSelect's inner field with `!searchable && !placeholder ? 'hidden' :
 * 'visible'`, and the component is never searchable. A falsy placeholder therefore used to
 * collapse the field to a 1px, `opacity: 0`, `pointer-events: none` box. That field carries the
 * DOM id the "jump to the first flagged field" rule looks up, so a hidden one sends the caret to
 * an invisible element and takes the click target away with it.
 */
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
