import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { Panel } from './panel'

describe('Panel', () => {
    // OTTER-662: the 50% alpha header tint let the navy account page show through.
    it('lays the header tint over an opaque surface', () => {
        renderWithProviders(<Panel title="MFA is enabled">body</Panel>)

        const tint = screen.getByRole('heading', { name: 'MFA is enabled' }).parentElement
        const base = tint?.parentElement

        expect(tint?.getAttribute('style') || '').toContain('--si-color-surface-tableheader')
        expect(base?.getAttribute('style') || '').toContain('--si-color-surface-raised')
    })
})
