import { describe, expect, it } from 'vitest'
import {
    parseDocumentName,
    proposalFieldsDocName,
    proposalTextFieldDocName,
    reviewFeedbackDocNameForVersion,
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

    it('round-trips versioned review-feedback docs', () => {
        for (const version of [1, 2, 17, 123]) {
            const name = reviewFeedbackDocNameForVersion(STUDY_ID, version)
            expect(name).toBe(`review-feedback-${STUDY_ID}-v${version}`)
            expect(parseDocumentName(name)).toEqual({ kind: 'review-feedback', studyId: STUDY_ID, version })
        }
    })

    it('rejects malformed review-feedback names', () => {
        expect(parseDocumentName(`review-feedback-${STUDY_ID}`)).toBeNull()
        expect(parseDocumentName(`review-feedback-${STUDY_ID}-v0`)).toBeNull()
        expect(parseDocumentName(`review-feedback-${STUDY_ID}-v01`)).toBeNull()
        expect(parseDocumentName(`review-feedback-${STUDY_ID}-v`)).toBeNull()
        expect(parseDocumentName(`review-feedback-${STUDY_ID}-foo`)).toBeNull()
        expect(parseDocumentName(`review-feedback-${STUDY_ID}-v-1`)).toBeNull()
        expect(parseDocumentName(`review-feedback-not-a-uuid-v1`)).toBeNull()
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
