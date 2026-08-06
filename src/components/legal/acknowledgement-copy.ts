import { type EnforcedLegalDocumentType, legalDocumentTypeLabels } from '@/schema/legal-document'

export type PublicLegalDocument = {
    type: EnforcedLegalDocumentType
    versionId: string
    content: string
}

export type PendingLegalDocument = PublicLegalDocument & {
    /** True when the user acknowledged an earlier version of this document, false when they never have. */
    isUpdate: boolean
}

// "Terms of Service and Privacy Notice". Only ever one or two documents, so no Oxford comma case.
const documentNames = (documents: PendingLegalDocument[]) =>
    documents.map((document) => legalDocumentTypeLabels[document.type]).join(' and ')

export const legalAcknowledgementTitle = documentNames

/**
 * Body copy, following the wording UX established for the participation-agreement modals.
 *
 * A user can owe a brand-new document and an updated one at the same time — acked ToS v1, then we
 * publish ToS v2 alongside the first Privacy Notice. Neither "is now available" nor "has been
 * updated" is true of that pair, so it falls back to neutral wording rather than saying something
 * inaccurate about a legal document.
 */
export const legalAcknowledgementBody = (documents: PendingLegalDocument[]) => {
    if (!documents.length) return ''

    const names = documentNames(documents)
    const isPlural = documents.length > 1

    if (documents.every((document) => document.isUpdate)) {
        return `The ${names} ${isPlural ? 'have' : 'has'} been updated. Please review before proceeding.`
    }
    if (documents.every((document) => !document.isUpdate)) {
        return `The ${names} ${isPlural ? 'are' : 'is'} now available. Please review before proceeding.`
    }
    return 'Please review and acknowledge the following before continuing.'
}

export const legalAcknowledgementCheckboxLabel = (documents: PendingLegalDocument[]) => {
    if (!documents.length) return ''

    // "updated" only when it is true of every document named in the same sentence.
    const updated = documents.every((document) => document.isUpdate) ? 'updated ' : ''
    return `I have read and acknowledge the ${updated}${documentNames(documents)}`
}
