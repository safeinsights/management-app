import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen } from '@/tests/unit.helpers'
import {
    legalAcknowledgementBody,
    legalAcknowledgementCheckboxLabel,
    legalAcknowledgementTitle,
} from './acknowledgement-copy'
import type { PendingLegalDocument } from '@/schema/legal-document'

const markdownDoc = (type: 'TOS' | 'PN', isUpdate: boolean): PendingLegalDocument => ({
    type,
    isUpdate,
    versionId: `${type}-version`,
    format: 'markdown',
    content: '# doc',
    orgName: null,
})

const pdfDoc = (
    type: 'ROPA' | 'DOPA',
    isUpdate: boolean,
    orgName: string | null,
    url = 'https://files.example/agreement.pdf',
): PendingLegalDocument => ({
    type,
    isUpdate,
    versionId: `${type}-version`,
    format: 'pdf',
    url,
    orgName,
})

const bodyText = (document: PendingLegalDocument) => {
    renderWithProviders(<div data-testid="ack-body">{legalAcknowledgementBody(document)}</div>)
    return screen.getByTestId('ack-body').textContent
}

describe('legalAcknowledgementBody', () => {
    it('announces a new document', () => {
        expect(bodyText(markdownDoc('TOS', false))).toBe(
            'The Terms of Service is now available. Please review before proceeding.',
        )
    })

    it('announces an updated document', () => {
        expect(bodyText(markdownDoc('TOS', true))).toBe(
            'The Terms of Service has been updated. Please review before proceeding.',
        )
    })

    it('names the binding org for an org-scoped agreement', () => {
        expect(bodyText(pdfDoc('ROPA', false, 'Acme Lab'))).toBe(
            'The Research Organization Participation Agreement for Acme Lab is now available. Please review before proceeding.',
        )
    })

    it('links a pdf agreement to its signed url in a new tab', () => {
        renderWithProviders(
            <>{legalAcknowledgementBody(pdfDoc('ROPA', false, 'Acme Lab', 'https://files.example/ropa.pdf'))}</>,
        )

        const link = screen.getByRole('link', { name: /Research Organization Participation Agreement/ })
        expect(link).toHaveAttribute('href', 'https://files.example/ropa.pdf')
        expect(link).toHaveAttribute('target', '_blank')
    })

    it('renders a markdown document name as plain text, not a link', () => {
        renderWithProviders(<>{legalAcknowledgementBody(markdownDoc('TOS', false))}</>)

        expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })
})

describe('legalAcknowledgementCheckboxLabel', () => {
    it('says "updated" only for a document the user acknowledged an earlier version of', () => {
        expect(legalAcknowledgementCheckboxLabel(markdownDoc('TOS', true))).toBe(
            'I have read and acknowledge the updated Terms of Service',
        )
        expect(legalAcknowledgementCheckboxLabel(markdownDoc('PN', false))).toBe(
            'I have read and acknowledge the Privacy Notice',
        )
    })
})

describe('legalAcknowledgementTitle', () => {
    it('names the document being asked about', () => {
        expect(legalAcknowledgementTitle(markdownDoc('TOS', false))).toBe('Terms of Service')
        expect(legalAcknowledgementTitle(markdownDoc('PN', false))).toBe('Privacy Notice')
    })
})
