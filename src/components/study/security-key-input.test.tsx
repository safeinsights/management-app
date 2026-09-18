import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { createRef } from 'react'
import { TEXTAREA_RESIZE_FLOOR } from '@/components/textarea-resize'
import { SecurityKeyInput } from './security-key-input'

describe('SecurityKeyInput', () => {
    it('renders a textarea with autocomplete off', () => {
        renderWithProviders(<SecurityKeyInput />)
        expect(screen.getByRole('textbox')).toHaveAttribute('autocomplete', 'off')
    })

    it('marks the input as required', () => {
        renderWithProviders(<SecurityKeyInput />)
        expect(screen.getByRole('textbox')).toHaveAttribute('aria-required', 'true')
    })

    it('does not use aria-live', () => {
        renderWithProviders(<SecurityKeyInput />)
        expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-live')
    })

    it('forwards additional props', () => {
        renderWithProviders(<SecurityKeyInput placeholder="Paste your key" />)
        expect(screen.getByPlaceholderText('Paste your key')).toBeInTheDocument()
    })

    it('forwards a ref to the underlying textarea', () => {
        const ref = createRef<HTMLTextAreaElement>()
        renderWithProviders(<SecurityKeyInput ref={ref} />)
        expect(ref.current).toBe(screen.getByRole('textbox'))
    })

    it('associates and announces the error, and marks the field invalid', () => {
        renderWithProviders(<SecurityKeyInput error="Something went wrong" />)
        const textbox = screen.getByRole('textbox')
        expect(textbox).toHaveAttribute('aria-invalid', 'true')

        const alert = screen.getByRole('alert')
        expect(alert).toHaveTextContent('Something went wrong')

        const describedBy = textbox.getAttribute('aria-describedby')
        expect(describedBy).toBeTruthy()
        expect(alert.closest(`#${describedBy}`)).not.toBeNull()
    })

    it('supports the native disabled attribute', () => {
        renderWithProviders(<SecurityKeyInput disabled />)
        expect(screen.getByRole('textbox')).toBeDisabled()
    })

    it('offers a vertical resize handle (OTTER-787)', () => {
        renderWithProviders(<SecurityKeyInput />)
        const host = screen.getByRole('textbox').closest('[style*="--input-resize"]') as HTMLElement
        expect(host.style.getPropertyValue('--input-resize')).toBe('vertical')
    })

    // The floor is the whole point: without it a drag shrinks the field under the height it loads
    // at, because Mantine's own minimum for a multiline input is a single row.
    it('floors the field at its own load height so a drag cannot shrink it', () => {
        renderWithProviders(<SecurityKeyInput />)
        expect(screen.getByRole('textbox')).toHaveStyle({ minHeight: `${TEXTAREA_RESIZE_FLOOR}px` })
    })
})
