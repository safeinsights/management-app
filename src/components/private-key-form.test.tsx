import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { useForm } from '@/common'
import { vi } from 'vitest'
import { TEXTAREA_RESIZE_FLOOR } from '@/components/textarea-resize'
import { PrivateKeyForm, type PrivateKeyFormValues } from './private-key-form'

function Harness() {
    const form = useForm<PrivateKeyFormValues>({ initialValues: { privateKey: '' } })

    return <PrivateKeyForm form={form} onSubmit={vi.fn()} isDecrypting={false} submitLabel="View results" />
}

describe('PrivateKeyForm', () => {
    it('offers a vertical resize handle on the key field (OTTER-787)', () => {
        renderWithProviders(<Harness />)
        const host = screen.getByRole('textbox').closest('[style*="--input-resize"]') as HTMLElement
        expect(host.style.getPropertyValue('--input-resize')).toBe('vertical')
    })

    // Without the floor a drag shrinks the field under the height it loads at, because Mantine's
    // own minimum for a multiline input is a single row.
    it('floors the key field at its own load height so a drag cannot shrink it', () => {
        renderWithProviders(<Harness />)
        expect(screen.getByRole('textbox')).toHaveStyle({ minHeight: `${TEXTAREA_RESIZE_FLOOR}px` })
    })
})
