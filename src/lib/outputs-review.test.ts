import { describe, expect, it } from '@/tests/unit.helpers'
import {
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

    // Not REJECT: withholding the files asks the lab to revise and resubmit, whereas REJECT is
    // the terminal decision that ends a study.
    it('maps feedback-only to a clarification request, not a rejection', () => {
        expect(toOutputsReviewDecision('share-feedback-only')).toBe('NEEDS-CLARIFICATION')
    })

    it('offers exactly two mutually exclusive decisions', () => {
        expect(OUTPUTS_DECISIONS).toEqual(['share-outputs', 'share-feedback-only'])
    })

    // One cap for both run outcomes. It used to depend on whether the run errored (OTTER-737).
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
        expect(OUTPUTS_DECISION_ERRORS.feedbackTooLong).toBe('Decision exceeds the 1800 limit. Shorten it to continue.')
        expect(OUTPUTS_DECISION_ERRORS.decisionMissing).toBe('Select an option before submitting')
    })
})
