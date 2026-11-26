import { describe, expect, it } from 'vitest'
import {
    parseStudyEvent,
    studyEventsDocName,
    codeReviewFeedbackDocName,
    outputsReviewFeedbackDocName,
    parseDocumentName,
    proposalFieldsDocName,
    proposalResubmissionNoteDocNameForVersion,
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

    it('round-trips versioned resubmission-note docs', () => {
        for (const version of [2, 3, 17, 123]) {
            const name = proposalResubmissionNoteDocNameForVersion(STUDY_ID, version)
            expect(name).toBe(`proposal-${STUDY_ID}-resubmission-note-v${version}`)
            expect(parseDocumentName(name)).toEqual({
                kind: 'proposal-resubmission-note',
                studyId: STUDY_ID,
                version,
            })
        }
    })

    it('rejects malformed resubmission-note names', () => {
        expect(parseDocumentName(`proposal-${STUDY_ID}-resubmission-note`)).toBeNull()
        expect(parseDocumentName(`proposal-${STUDY_ID}-resubmission-note-v0`)).toBeNull()
        expect(parseDocumentName(`proposal-${STUDY_ID}-resubmission-note-v01`)).toBeNull()
        expect(parseDocumentName(`proposal-${STUDY_ID}-resubmission-note-v`)).toBeNull()
        expect(parseDocumentName(`proposal-${STUDY_ID}-resubmission-note-v-1`)).toBeNull()
        expect(parseDocumentName(`proposal-not-a-uuid-resubmission-note-v2`)).toBeNull()
    })

    it('round-trips code-review-feedback docs', () => {
        const JOB_ID = '01949c1a-1aaa-7000-9000-0000000000ff'
        const name = codeReviewFeedbackDocName(JOB_ID)
        expect(name).toBe(`code-review-feedback-${JOB_ID}`)
        expect(parseDocumentName(name)).toEqual({ kind: 'code-review-feedback', jobId: JOB_ID })
    })

    it('round-trips outputs-review-feedback docs', () => {
        const JOB_ID = '01949c1a-1aaa-7000-9000-0000000000ff'
        const name = outputsReviewFeedbackDocName(JOB_ID)
        expect(name).toBe(`outputs-review-feedback-${JOB_ID}`)
        expect(parseDocumentName(name)).toEqual({ kind: 'outputs-review-feedback', jobId: JOB_ID })
    })

    it('keeps the two job-keyed feedback prefixes distinct', () => {
        const JOB_ID = '01949c1a-1aaa-7000-9000-0000000000ff'
        expect(parseDocumentName(outputsReviewFeedbackDocName(JOB_ID))).toEqual({
            kind: 'outputs-review-feedback',
            jobId: JOB_ID,
        })
        expect(parseDocumentName(codeReviewFeedbackDocName(JOB_ID))).toEqual({
            kind: 'code-review-feedback',
            jobId: JOB_ID,
        })
    })

    it('rejects malformed names', () => {
        expect(parseDocumentName('')).toBeNull()
        expect(parseDocumentName('proposal-not-a-uuid-fields')).toBeNull()
        expect(parseDocumentName('proposal-')).toBeNull()
        expect(parseDocumentName(`proposal-${STUDY_ID}-unknown-suffix`)).toBeNull()
        expect(parseDocumentName(`unknown-${STUDY_ID}`)).toBeNull()
        expect(parseDocumentName(`review-feedback-not-a-uuid`)).toBeNull()
        expect(parseDocumentName(`code-review-feedback-not-a-uuid`)).toBeNull()
        expect(parseDocumentName(`outputs-review-feedback-not-a-uuid`)).toBeNull()
    })
})

describe('study events', () => {
    const studyId = '01a1fb45-743f-7745-bd47-adbced0a2312'
    const jobId = '01a1fb45-7478-7c69-afd9-057be4c194e9'

    it('names and parses the per-study events document', () => {
        expect(studyEventsDocName(studyId)).toBe(`study-events-${studyId}`)
        expect(parseDocumentName(studyEventsDocName(studyId))).toEqual({ kind: 'study-events', studyId })
        expect(parseDocumentName('study-events-not-a-uuid')).toBeNull()
    })

    it('parses an event from its JSON text', () => {
        const event = {
            type: 'study-changed',
            studyId,
            change: 'code-review-submitted',
            jobId,
            submittedBy: { name: 'Ada Lovelace' },
            originTabId: 'tab-1',
        }
        expect(parseStudyEvent(JSON.stringify(event))).toEqual(event)
        expect(parseStudyEvent({ type: 'study-changed', studyId, change: 'resync' })).toEqual({
            type: 'study-changed',
            studyId,
            change: 'resync',
        })
    })

    it('keeps an event whose display fields are unusable, without them', () => {
        expect(
            parseStudyEvent({
                type: 'study-changed',
                studyId,
                change: 'code-submitted',
                submittedBy: { name: '' },
                orgName: '',
            }),
        ).toEqual({ type: 'study-changed', studyId, change: 'code-submitted' })
    })

    it('refuses anything that is not a well-formed event', () => {
        expect(parseStudyEvent('not json')).toBeNull()
        expect(parseStudyEvent({ type: 'other', studyId, change: 'job-status' })).toBeNull()
        expect(parseStudyEvent({ type: 'study-changed', studyId: 'nope', change: 'job-status' })).toBeNull()
        expect(parseStudyEvent({ type: 'study-changed', studyId, change: 'made-up' })).toBeNull()
        expect(parseStudyEvent({ type: 'study-changed', studyId, change: 'job-status', jobId: 'x' })).toBeNull()
        expect(
            parseStudyEvent({ type: 'study-changed', studyId, change: 'job-status', originTabId: 'x'.repeat(65) }),
        ).toBeNull()
    })
})
