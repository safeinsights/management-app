import dayjs from 'dayjs'
import { describe, expect, it, renderToServerHtml, renderWithProviders, screen, vi } from '@/tests/unit.helpers'
import { SignedOnInput } from './signed-on-input'

describe('SignedOnInput', () => {
    it('limits the picker to the admin’s local day', () => {
        renderWithProviders(<SignedOnInput value="" onChange={vi.fn()} />)

        expect(screen.getByLabelText('Signed on')).toHaveAttribute('max', dayjs().format('YYYY-MM-DD'))
    })

    it('sends no limit in the server HTML, whose day is UTC', () => {
        const html = renderToServerHtml(<SignedOnInput value="" onChange={vi.fn()} />)

        expect(html).toContain('type="date"')
        expect(html).not.toContain('max=')
    })
})
