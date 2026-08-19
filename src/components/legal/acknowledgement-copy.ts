import { legalDocumentTypeLabels, type PendingLegalDocument } from '@/schema/legal-document'

export const legalAcknowledgementTitle = (document: PendingLegalDocument) => legalDocumentTypeLabels[document.type]

// Wording follows what UX established for the participation-agreement modals. One document per modal,
// so the sentence can always say the true thing about it rather than hedging across a pair.
export const legalAcknowledgementBody = (document: PendingLegalDocument) => {
    const name = legalAcknowledgementTitle(document)
    const state = document.isUpdate ? 'has been updated' : 'is now available'

    return `The ${name} ${state}. Please review before proceeding.`
}

export const legalAcknowledgementCheckboxLabel = (document: PendingLegalDocument) => {
    const updated = document.isUpdate ? 'updated ' : ''

    return `I have read and acknowledge the ${updated}${legalAcknowledgementTitle(document)}`
}
