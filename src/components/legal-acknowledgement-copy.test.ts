import { describe, expect, it } from 'vitest'
import {
    legalAcknowledgementBody,
    legalAcknowledgementCheckboxLabel,
    legalAcknowledgementTitle,
    type PendingLegalDocument,
} from './legal-acknowledgement-copy'

const document = (type: PendingLegalDocument['type'], isUpdate: boolean): PendingLegalDocument => ({
    type,
    isUpdate,
    versionId: `${type}-version`,
    content: '# doc',
})

const tosNew = document('tos', false)
const tosUpdated = document('tos', true)
const pnNew = document('pn', false)
const pnUpdated = document('pn', true)

describe('legalAcknowledgementBody', () => {
    it('announces a single new document in the singular', () => {
        expect(legalAcknowledgementBody([tosNew])).toBe(
            'The Terms of Service is now available. Please review before proceeding.',
        )
    })

    it('announces a single updated document in the singular', () => {
        expect(legalAcknowledgementBody([tosUpdated])).toBe(
            'The Terms of Service has been updated. Please review before proceeding.',
        )
    })

    it('agrees the verb with two documents', () => {
        expect(legalAcknowledgementBody([tosNew, pnNew])).toBe(
            'The Terms of Service and Privacy Notice are now available. Please review before proceeding.',
        )
        expect(legalAcknowledgementBody([tosUpdated, pnUpdated])).toBe(
            'The Terms of Service and Privacy Notice have been updated. Please review before proceeding.',
        )
    })

    // A first Privacy Notice published alongside a second Terms of Service: neither "are now
    // available" nor "have been updated" is true, and a legal document is the wrong place to be
    // approximately right.
    it('falls back to neutral wording when one is new and the other updated', () => {
        expect(legalAcknowledgementBody([tosUpdated, pnNew])).toBe(
            'Please review and acknowledge the following before continuing.',
        )
    })
})

describe('legalAcknowledgementCheckboxLabel', () => {
    it('says "updated" only when it is true of every document it names', () => {
        expect(legalAcknowledgementCheckboxLabel([tosUpdated, pnUpdated])).toBe(
            'I have read and acknowledge the updated Terms of Service and Privacy Notice',
        )
        expect(legalAcknowledgementCheckboxLabel([tosUpdated, pnNew])).toBe(
            'I have read and acknowledge the Terms of Service and Privacy Notice',
        )
        expect(legalAcknowledgementCheckboxLabel([pnNew])).toBe('I have read and acknowledge the Privacy Notice')
    })
})

describe('legalAcknowledgementTitle', () => {
    it('names the documents being asked about', () => {
        expect(legalAcknowledgementTitle([tosNew])).toBe('Terms of Service')
        expect(legalAcknowledgementTitle([tosNew, pnNew])).toBe('Terms of Service and Privacy Notice')
    })
})
