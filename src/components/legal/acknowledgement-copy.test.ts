import { describe, expect, it } from 'vitest'
import {
    legalAcknowledgementBody,
    legalAcknowledgementCheckboxLabel,
    legalAcknowledgementTitle,
    type PendingLegalDocument,
} from './acknowledgement-copy'

const document = (type: PendingLegalDocument['type'], isUpdate: boolean): PendingLegalDocument => ({
    type,
    isUpdate,
    versionId: `${type}-version`,
    content: '# doc',
})

const tosNew = document('TOS', false)
const tosUpdated = document('TOS', true)
const pnNew = document('PN', false)

describe('legalAcknowledgementBody', () => {
    it('announces a new document', () => {
        expect(legalAcknowledgementBody(tosNew)).toBe(
            'The Terms of Service is now available. Please review before proceeding.',
        )
    })

    it('announces an updated document', () => {
        expect(legalAcknowledgementBody(tosUpdated)).toBe(
            'The Terms of Service has been updated. Please review before proceeding.',
        )
    })
})

describe('legalAcknowledgementCheckboxLabel', () => {
    it('says "updated" only for a document the user acknowledged an earlier version of', () => {
        expect(legalAcknowledgementCheckboxLabel(tosUpdated)).toBe(
            'I have read and acknowledge the updated Terms of Service',
        )
        expect(legalAcknowledgementCheckboxLabel(pnNew)).toBe('I have read and acknowledge the Privacy Notice')
    })
})

describe('legalAcknowledgementTitle', () => {
    it('names the document being asked about', () => {
        expect(legalAcknowledgementTitle(tosNew)).toBe('Terms of Service')
        expect(legalAcknowledgementTitle(pnNew)).toBe('Privacy Notice')
    })
})
