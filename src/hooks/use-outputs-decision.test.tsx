import type { ReactNode } from 'react'
import { act, createTestQueryWrapper, describe, expect, faker, it, renderHook, waitFor } from '@/tests/unit.helpers'
import { notifications } from '@mantine/notifications'
import { memoryRouter } from 'next-router-mock'
import { lexicalJson } from '@/lib/lexical'
import {
    isOutputsReviewEditable,
    OUTPUTS_DECIDED_NOTICE,
    OUTPUTS_DECISION_ERRORS,
    OUTPUTS_DECISION_FAILURE,
    OUTPUTS_FEEDBACK_MAX_CHARACTERS,
} from '@/lib/outputs-review'
import { OutputsReviewFeedbackProviderShare } from '@/lib/realtime/outputs-review-feedback-provider-context'
import { YjsWebsocketProvider } from '@/lib/realtime/yjs-websocket-context'
import { StudyKickOutProvider } from '@/hooks/use-study-status-on-reconnect'
import { useOutputsDecision } from './use-outputs-decision'

const LAB = 'Rice Lab'

// The hook reads the outputs editor's provider to broadcast the decision and to tell whether the
// feedback has reached the editor service, so its share has to be mounted above it.
const renderDecision = () => {
    // Fixed per render, not per call: these feed the broadcast document name, and a fresh id on
    // every render would reopen that connection on every render.
    const ids = { studyId: faker.string.uuid(), jobId: faker.string.uuid(), tabSessionId: faker.string.uuid() }
    const QueryWrapper = createTestQueryWrapper()
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryWrapper>
            <OutputsReviewFeedbackProviderShare>{children}</OutputsReviewFeedbackProviderShare>
        </QueryWrapper>
    )

    return renderHook(
        () =>
            useOutputsDecision({
                orgSlug: 'openstax',
                labName: LAB,
                decryptedFiles: [],
                ...ids,
            }),
        { wrapper },
    )
}

// OTTER-675: flagging the feedback field on blur moved the submit button between mousedown and
// mouseup, costing the click that caused it, so the reviewer saw one problem per click.
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

    // 400 short words is past the old 300-word cap but inside 1800 characters, so this fails if
    // word counting survived.
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

// OTTER-726: the failure path runs the real status backstop before it speaks. With no session and
// no such study, the submit and the status read both come back as error envelopes, which is the
// shape a reviewer meets when the server refuses the decision for an ordinary reason.
describe('useOutputsDecision after a refused submit', () => {
    const renderWithBackstop = () => {
        const studyId = faker.string.uuid()
        const jobId = faker.string.uuid()
        const tabSessionId = faker.string.uuid()
        const QueryWrapper = createTestQueryWrapper()
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryWrapper>
                <YjsWebsocketProvider singleUserEditing>
                    <StudyKickOutProvider
                        studyId={studyId}
                        studyJobId={jobId}
                        orgSlug="openstax"
                        editableStatuses={[]}
                        isEditable={isOutputsReviewEditable}
                        redirectTarget="studyReview"
                        notice={OUTPUTS_DECIDED_NOTICE}
                    >
                        <OutputsReviewFeedbackProviderShare>{children}</OutputsReviewFeedbackProviderShare>
                    </StudyKickOutProvider>
                </YjsWebsocketProvider>
            </QueryWrapper>
        )

        return renderHook(
            () =>
                useOutputsDecision({
                    orgSlug: 'openstax',
                    studyId,
                    jobId,
                    labName: LAB,
                    decryptedFiles: [],
                    tabSessionId,
                }),
            { wrapper },
        )
    }

    it('closes the confirmation and reports the failure without claiming the work is saved', async () => {
        memoryRouter.setCurrentUrl('/start')
        const { result } = renderWithBackstop()

        act(() => result.current.onFeedbackChange(lexicalJson('Outputs look clean, no PII observed.')))
        act(() => result.current.onSelect('share-feedback-only'))
        act(() => result.current.attemptSubmit())
        expect(result.current.confirming).toBe('share-feedback-only')

        await act(async () => result.current.confirmSubmit())

        await waitFor(() =>
            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: OUTPUTS_DECISION_FAILURE.title,
                    // Single-user editing has no collaborative document behind it, so the feedback
                    // exists only on screen and the notice must not promise otherwise.
                    message: OUTPUTS_DECISION_FAILURE.unsaved,
                }),
            ),
        )
        expect(result.current.confirming).toBeNull()
        // The round was not decided, so the backstop must not have redirected.
        expect(memoryRouter.asPath).toBe('/start')
    })
})
