import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/tests/unit.helpers'
import { PreviewDocument } from './preview-document'

describe('PreviewDocument', () => {
    it('renders the fetched markdown', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () => ({ ok: true, status: 200, text: async () => '# Terms of Service' }) as unknown as Response,
            ),
        )

        renderWithProviders(<PreviewDocument url="https://example.com/doc.md" label="Terms of Service" />)

        expect(await screen.findByRole('heading', { name: 'Terms of Service' })).toBeDefined()
    })

    it('surfaces an error when the document cannot be loaded', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response),
        )

        renderWithProviders(<PreviewDocument url="https://example.com/doc.md" label="Terms of Service" />)

        // ErrorAlert always renders its default title.
        expect(await screen.findByText('An error occurred')).toBeDefined()
    })
})
