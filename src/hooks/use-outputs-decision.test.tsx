import { act, createTestQueryWrapper, describe, expect, faker, it, renderHook } from '@/tests/unit.helpers'
import { lexicalJson } from '@/lib/lexical'
import { OUTPUTS_DECISION_ERRORS, OUTPUTS_FEEDBACK_MAX_CHARACTERS } from '@/lib/outputs-review'
import { useOutputsDecision } from './use-outputs-decision'

const LAB = 'Rice Lab'

const renderDecision = () =>
    renderHook(
        () =>
            useOutputsDecision({
                orgSlug: 'openstax',
                studyId: faker.string.uuid(),
                jobId: faker.string.uuid(),
                labName: LAB,
                decryptedFiles: [],
            }),
        { wrapper: createTestQueryWrapper() },
    )

// OTTER-675: a failed submit must flag every unresolved field on the FIRST click. Flagging the
// feedback field on blur instead moved the submit button between mousedown and mouseup, which cost
// the click that caused it, so the reviewer saw one problem per click.
describe('useOutputsDecision', () => {
    it('opens with nothing flagged', () => {
        const { result } = renderDecision()

        expect(result.current.feedbackError).toBeUndefined()
        expect(result.current.decisionError).toBeUndefined()
    })

    it('leaves an untouched empty form unflagged until a submit attempt', () => {
        const { result } = renderDecision()

        act(() => result.current.onFeedbackChange(lexicalJson('')))

        expect(result.current.feedbackError).toBeUndefined()
        expect(result.current.decisionError).toBeUndefined()
    })

    it('flags both the feedback and the decision on a single failed submit', () => {
        const { result } = renderDecision()

        act(() => result.current.attemptSubmit())

        expect(result.current.feedbackError).toBe(OUTPUTS_DECISION_ERRORS.feedbackEmpty(LAB))
        expect(result.current.decisionError).toBe(OUTPUTS_DECISION_ERRORS.decisionMissing)
        expect(result.current.confirming).toBeNull()
    })

    it('reports the over-limit error before any submit attempt', () => {
        const { result } = renderDecision()

        act(() => result.current.onFeedbackChange(lexicalJson('x'.repeat(OUTPUTS_FEEDBACK_MAX_CHARACTERS + 1))))

        expect(result.current.feedbackError).toBe(OUTPUTS_DECISION_ERRORS.feedbackTooLong)
        expect(result.current.decisionError).toBeUndefined()
    })

    it('accepts feedback at exactly the character limit', () => {
        const { result } = renderDecision()

        act(() => result.current.onFeedbackChange(lexicalJson('x'.repeat(OUTPUTS_FEEDBACK_MAX_CHARACTERS))))

        expect(result.current.feedbackError).toBeUndefined()
        expect(result.current.characterCount).toBe(OUTPUTS_FEEDBACK_MAX_CHARACTERS)
    })

    // Characters, not words: 400 short words is past the old 300-word errored-run cap and inside
    // 1800 characters, so this fails if word counting survived.
    it('measures characters rather than words', () => {
        const { result } = renderDecision()

        act(() => result.current.onFeedbackChange(lexicalJson(Array.from({ length: 400 }, () => 'ab').join(' '))))

        expect(result.current.feedbackError).toBeUndefined()
    })

    it('treats whitespace-only feedback as empty on submit', () => {
        const { result } = renderDecision()

        act(() => result.current.onFeedbackChange(lexicalJson('   ')))
        act(() => result.current.attemptSubmit())

        expect(result.current.feedbackError).toBe(OUTPUTS_DECISION_ERRORS.feedbackEmpty(LAB))
    })

    it('clears each message as its own field is resolved', () => {
        const { result } = renderDecision()

        act(() => result.current.attemptSubmit())
        act(() => result.current.onSelect('share-outputs'))

        expect(result.current.decisionError).toBeUndefined()
        expect(result.current.feedbackError).toBe(OUTPUTS_DECISION_ERRORS.feedbackEmpty(LAB))

        act(() => result.current.onFeedbackChange(lexicalJson('Outputs look clean, no PII observed.')))

        expect(result.current.feedbackError).toBeUndefined()
    })

    it('confirms once everything is resolved', () => {
        const { result } = renderDecision()

        act(() => result.current.attemptSubmit())
        act(() => result.current.onFeedbackChange(lexicalJson('Outputs look clean, no PII observed.')))
        act(() => result.current.onSelect('share-feedback-only'))
        act(() => result.current.attemptSubmit())

        expect(result.current.confirming).toBe('share-feedback-only')
    })
})
