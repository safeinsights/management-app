import { act, createTestQueryWrapper, describe, expect, faker, it, renderHook } from '@/tests/unit.helpers'
import { ERRORED_OUTPUTS_FEEDBACK_MAX_WORDS, OUTPUTS_DECISION_ERRORS } from '@/lib/outputs-review'
import { useOutputsDecision } from './use-outputs-decision'

const LAB = 'Rice Lab'

const lexicalText = (text: string) => JSON.stringify({ root: { type: 'text', text } })

const renderDecision = () =>
    renderHook(
        () =>
            useOutputsDecision({
                orgSlug: 'openstax',
                studyId: faker.string.uuid(),
                jobId: faker.string.uuid(),
                labName: LAB,
                maxWords: ERRORED_OUTPUTS_FEEDBACK_MAX_WORDS,
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

        act(() => result.current.onFeedbackChange(lexicalText('')))

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

        act(() =>
            result.current.onFeedbackChange(
                lexicalText(
                    Array.from({ length: ERRORED_OUTPUTS_FEEDBACK_MAX_WORDS + 1 }, (_, i) => `word${i}`).join(' '),
                ),
            ),
        )

        expect(result.current.feedbackError).toBe(
            OUTPUTS_DECISION_ERRORS.feedbackTooLong(ERRORED_OUTPUTS_FEEDBACK_MAX_WORDS),
        )
        expect(result.current.decisionError).toBeUndefined()
    })

    it('clears each message as its own field is resolved', () => {
        const { result } = renderDecision()

        act(() => result.current.attemptSubmit())
        act(() => result.current.onSelect('share-outputs'))

        expect(result.current.decisionError).toBeUndefined()
        expect(result.current.feedbackError).toBe(OUTPUTS_DECISION_ERRORS.feedbackEmpty(LAB))

        act(() => result.current.onFeedbackChange(lexicalText('Outputs look clean, no PII observed.')))

        expect(result.current.feedbackError).toBeUndefined()
    })

    it('confirms once everything is resolved', () => {
        const { result } = renderDecision()

        act(() => result.current.attemptSubmit())
        act(() => result.current.onFeedbackChange(lexicalText('Outputs look clean, no PII observed.')))
        act(() => result.current.onSelect('share-feedback-only'))
        act(() => result.current.attemptSubmit())

        expect(result.current.confirming).toBe('share-feedback-only')
    })
})
