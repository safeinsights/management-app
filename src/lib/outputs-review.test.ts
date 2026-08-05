import { describe, expect, it } from '@/tests/unit.helpers'
import {
    COMPLETED_OUTPUTS_FEEDBACK_MAX_WORDS,
    ERRORED_OUTPUTS_FEEDBACK_MAX_WORDS,
    OUTPUTS_DECISION_ERRORS,
    OUTPUTS_DECISIONS,
    OUTPUTS_FILE_NAME_MAX_LENGTH,
    toOutputsReviewDecision,
} from './outputs-review'

describe('outputs review decisions', () => {
    it('maps sharing the outputs to an approval', () => {
        expect(toOutputsReviewDecision('share-outputs')).toBe('APPROVE')
    })

    // Not REJECT: withholding the files asks the lab to revise and resubmit, whereas REJECT is
    // the terminal decision that ends a study.
    it('maps feedback-only to a clarification request, not a rejection', () => {
        expect(toOutputsReviewDecision('share-feedback-only')).toBe('NEEDS-CLARIFICATION')
    })

    it('offers exactly two mutually exclusive decisions', () => {
        expect(OUTPUTS_DECISIONS).toEqual(['share-outputs', 'share-feedback-only'])
    })

    it('caps errored-run feedback at 300 words and completed-run feedback higher', () => {
        expect(ERRORED_OUTPUTS_FEEDBACK_MAX_WORDS).toBe(300)
        expect(COMPLETED_OUTPUTS_FEEDBACK_MAX_WORDS).toBe(1500)
    })

    it('truncates file names at 50 characters', () => {
        expect(OUTPUTS_FILE_NAME_MAX_LENGTH).toBe(50)
    })

    it('names the lab in the empty-feedback error and the cap in the too-long error', () => {
        expect(OUTPUTS_DECISION_ERRORS.feedbackEmpty('Rice Lab')).toBe(
            'Enter your feedback for Rice Lab before submitting.',
        )
        expect(OUTPUTS_DECISION_ERRORS.feedbackTooLong(300)).toBe(
            'Feedback exceeds the 300 word limit. Shorten it to continue.',
        )
        expect(OUTPUTS_DECISION_ERRORS.decisionMissing).toBe('Select an option before submitting')
    })
})
