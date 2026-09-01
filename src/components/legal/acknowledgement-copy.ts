import { type EnforcedLegalDocumentType, legalDocumentTypeLabels } from '@/schema/legal-document'

export type PublicLegalDocument = {
    type: EnforcedLegalDocumentType
    versionId: string
    content: string
}

export type PendingLegalDocument = PublicLegalDocument & {
    /** True when an earlier version was acknowledged, false when the user never has. */
    isUpdate: boolean
}

export const legalAcknowledgementTitle = (document: PendingLegalDocument) => legalDocumentTypeLabels[document.type]

// One document per modal, so the sentence can name it rather than hedging across a pair.
export const legalAcknowledgementBody = (document: PendingLegalDocument) => {
    const name = legalAcknowledgementTitle(document)
    const state = document.isUpdate ? 'has been updated' : 'is now available'

    return `The ${name} ${state}. Please review before proceeding.`
}

export const legalAcknowledgementCheckboxLabel = (document: PendingLegalDocument) => {
    const updated = document.isUpdate ? 'updated ' : ''

    return `I have read and acknowledge the ${updated}${legalAcknowledgementTitle(document)}`
}
