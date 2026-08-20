import { legalDocumentTypeLabels, type PendingLegalDocument } from '@/schema/legal-document'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { LinkWithIcon } from '@/components/links'

export const legalAcknowledgementTitle = (document: PendingLegalDocument) => legalDocumentTypeLabels[document.type]

// Display PDF link or, if not pdf, just the name of the doc
const documentName = (document: PendingLegalDocument) => {
    const label = legalDocumentTypeLabels[document.type]
    if (document.format !== 'pdf') return label

    // For pdfs, link instead of DocumentSections and DocumentContent
    return (
        <LinkWithIcon href={document.url} target="_blank" rel="noreferrer" icon={<ArrowSquareOutIcon size={14} />}>
            {label}
        </LinkWithIcon>
    )
}

// Wording follows what UX established for the participation-agreement modals. One document per modal,
// so the sentence can always say the true thing about it rather than hedging across a pair.
export const legalAcknowledgementBody = (document: PendingLegalDocument) => {
    const state = document.isUpdate ? 'has been updated' : 'is now available'
    // Only org-scoped ropa/dopa
    const scope = document.orgName ? ` for ${document.orgName}` : ''

    return (
        <>
            The {documentName(document)}
            {scope} {state}. Please review before proceeding.
        </>
    )
}

export const legalAcknowledgementCheckboxLabel = (document: PendingLegalDocument) => {
    const updated = document.isUpdate ? 'updated ' : ''

    return `I have read and acknowledge the ${updated}${legalAcknowledgementTitle(document)}`
}
