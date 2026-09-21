import { describe, expect, it } from '@/tests/unit.helpers'
import {
    isOutputsReviewEditable,
    OUTPUTS_DECISION_ERRORS,
    OUTPUTS_DECISIONS,
    OUTPUTS_FEEDBACK_MAX_CHARACTERS,
    OUTPUTS_FILE_NAME_MAX_LENGTH,
    toOutputsReviewDecision,
} from './outputs-review'

describe('outputs review decisions', () => {
    it('maps sharing the outputs to an approval', () => {
        expect(toOutputsReviewDecision('share-outputs')).toBe('APPROVE')
    })

    // Not REJECT: withholding the files asks the lab to resubmit, while REJECT ends a study.
    it('maps feedback-only to a clarification request, not a rejection', () => {
        expect(toOutputsReviewDecision('share-feedback-only')).toBe('NEEDS-CLARIFICATION')
    })

    it('offers exactly two mutually exclusive decisions', () => {
        expect(OUTPUTS_DECISIONS).toEqual(['share-outputs', 'share-feedback-only'])
    })

    it('caps feedback at 1800 characters regardless of the run outcome', () => {
        expect(OUTPUTS_FEEDBACK_MAX_CHARACTERS).toBe(1800)
    })

    it('truncates file names at 50 characters', () => {
        expect(OUTPUTS_FILE_NAME_MAX_LENGTH).toBe(50)
    })

    it('names the lab in the empty-feedback error and the cap in the too-long error', () => {
        expect(OUTPUTS_DECISION_ERRORS.feedbackEmpty('Rice Lab')).toBe(
            'Enter your feedback for Rice Lab before submitting.',
        )
        expect(OUTPUTS_DECISION_ERRORS.feedbackTooLong).toBe(
            'Decision exceeds the 1800 character limit. Shorten it to continue.',
        )
        expect(OUTPUTS_DECISION_ERRORS.decisionMissing).toBe('Select an option before submitting')
    })
})

// OTTER-726: the status backstop asks whether the round is still open. The newest status row alone
// cannot answer that, because the scanner writes CODE-SCANNED asynchronously and it can land after
// the files decision on the same job.
describe('isOutputsReviewEditable', () => {
    it('is editable while no files decision exists', () => {
        expect(isOutputsReviewEditable({ jobStatuses: ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE'] })).toBe(true)
    })

    it('is closed once the files are approved or rejected', () => {
        expect(isOutputsReviewEditable({ jobStatuses: ['RUN-COMPLETE', 'FILES-APPROVED'] })).toBe(false)
        expect(isOutputsReviewEditable({ jobStatuses: ['RUN-COMPLETE', 'FILES-REJECTED'] })).toBe(false)
    })

    it('stays closed when a late CODE-SCANNED row follows the decision', () => {
        expect(
            isOutputsReviewEditable({
                jobStatuses: ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE', 'FILES-APPROVED', 'CODE-SCANNED'],
            }),
        ).toBe(false)
    })

    it('treats an unknown job as editable, because closing a review needs positive evidence', () => {
        expect(isOutputsReviewEditable({ jobStatuses: [] })).toBe(true)
    })
})
