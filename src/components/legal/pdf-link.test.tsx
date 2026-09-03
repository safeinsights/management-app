import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { describe, expect, it } from 'vitest'
import { PdfLink } from './pdf-link'

describe('PdfLink', () => {
    it('links to the pdf, opening it in a new tab', () => {
        renderWithProviders(<PdfLink url="https://example.com/doc.pdf" label="Study Agreement" />)

        const link = screen.getByRole('link', { name: 'Study Agreement' })
        expect(link).toHaveAttribute('href', 'https://example.com/doc.pdf')
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noreferrer')
    })
})
