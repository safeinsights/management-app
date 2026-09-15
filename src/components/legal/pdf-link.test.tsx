import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { describe, expect, it } from 'vitest'
import { EMPTY_CELL } from '@/lib/dates'
import { LegalDocumentPdfLink, PdfLink } from './pdf-link'

describe('PdfLink', () => {
    it('links to the pdf, opening it in a new tab', () => {
        renderWithProviders(<PdfLink url="https://example.com/doc.pdf" label="Study Agreement" />)

        const link = screen.getByRole('link', { name: 'Study Agreement' })
        expect(link).toHaveAttribute('href', 'https://example.com/doc.pdf')
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noreferrer')
    })

    it('labels itself PDF when a table cell gives no label', () => {
        renderWithProviders(<PdfLink url="https://example.com/doc.pdf" />)

        expect(screen.getByRole('link', { name: 'PDF' })).toBeDefined()
    })

    it('dashes an unsigned row rather than linking nowhere', () => {
        renderWithProviders(<PdfLink url={null} />)

        expect(screen.queryByRole('link')).toBeNull()
        expect(screen.getByText(EMPTY_CELL)).toBeDefined()
    })
})

describe('LegalDocumentPdfLink', () => {
    it('links to the download route rather than a signed url', () => {
        renderWithProviders(<LegalDocumentPdfLink versionId="0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b" />)

        expect(screen.getByRole('link', { name: /PDF/ })).toHaveAttribute(
            'href',
            '/dl/legal/0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
        )
    })

    it('dashes when the row has no published version', () => {
        renderWithProviders(<LegalDocumentPdfLink versionId={null} />)

        expect(screen.queryByRole('link')).toBeNull()
    })
})
