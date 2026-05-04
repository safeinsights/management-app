import { describe, expect, it } from 'vitest'
import {
    parseDocumentName,
    proposalFieldsDocName,
    proposalTextFieldDocName,
    reviewFeedbackDocName,
} from './collaboration-documents'

const STUDY_ID = '01949c1a-1aaa-7000-9000-000000000001'

describe('collaboration document naming', () => {
    it('round-trips proposal-fields docs', () => {
        const name = proposalFieldsDocName(STUDY_ID)
        expect(name).toBe(`proposal-${STUDY_ID}-fields`)
        expect(parseDocumentName(name)).toEqual({ kind: 'proposal-fields', studyId: STUDY_ID })
    })

    it('round-trips proposal-text docs for every field key', () => {
        const cases = [
            ['researchQuestions', 'research-questions'],
            ['projectSummary', 'project-summary'],
            ['impact', 'impact'],
            ['additionalNotes', 'additional-notes'],
        ] as const
        for (const [key, slug] of cases) {
            const name = proposalTextFieldDocName(STUDY_ID, key)
            expect(name).toBe(`proposal-${STUDY_ID}-${slug}`)
            expect(parseDocumentName(name)).toEqual({ kind: 'proposal-text', studyId: STUDY_ID, fieldKey: key })
        }
    })

    it('round-trips review-feedback docs', () => {
        const name = reviewFeedbackDocName(STUDY_ID)
        expect(name).toBe(`review-feedback-${STUDY_ID}`)
        expect(parseDocumentName(name)).toEqual({ kind: 'review-feedback', studyId: STUDY_ID })
    })

    it('rejects malformed names', () => {
        expect(parseDocumentName('')).toBeNull()
        expect(parseDocumentName('proposal-not-a-uuid-fields')).toBeNull()
        expect(parseDocumentName('proposal-')).toBeNull()
        expect(parseDocumentName(`proposal-${STUDY_ID}-unknown-suffix`)).toBeNull()
        expect(parseDocumentName(`unknown-${STUDY_ID}`)).toBeNull()
        expect(parseDocumentName(`review-feedback-not-a-uuid`)).toBeNull()
    })
})
