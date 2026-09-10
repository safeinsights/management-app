import type { ReactNode } from 'react'
import { vi } from 'vitest'
import * as RouterMock from 'next-router-mock'
import {
    act,
    beforeEach,
    createTestQueryClient,
    describe,
    expect,
    faker,
    it,
    QueryClientProvider,
    renderHook,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { lexicalJson } from '@/lib/lexical'
import { OUTPUTS_DECISION_ERRORS, OUTPUTS_FEEDBACK_MAX_CHARACTERS } from '@/lib/outputs-review'
import { OutputsReviewFeedbackProviderShare } from '@/lib/realtime/outputs-review-feedback-provider-context'
import { OutputsDecisionCoordinationProvider } from '@/components/study/outputs-decision-coordination'
import { getOutputsDecisionStatusAction, submitOutputsDecisionAction } from '@/server/actions/study-job.actions'
import { useOutputsDecision } from './use-outputs-decision'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const memoryRouter = (RouterMock as any).memoryRouter as { asPath: string; setCurrentUrl: (url: string) => void }

vi.mock('@/server/actions/study-job.actions', () => ({
    submitOutputsDecisionAction: vi.fn(),
    getOutputsDecisionStatusAction: vi.fn(),
}))

const submitMock = submitOutputsDecisionAction as unknown as Mock
const statusMock = getOutputsDecisionStatusAction as unknown as Mock

const LAB = 'Rice Lab'
const ORG = 'openstax'

const undecided = {
    decided: false,
    decision: null,
    decidedById: null,
    decidedByName: null,
    decidedAt: null,
}

// `monitorEnabled` stays false for the validation tests so no background status read runs.
const renderDecision = ({
    monitorEnabled = false,
    studyId = faker.string.uuid(),
    jobId = faker.string.uuid(),
}: { monitorEnabled?: boolean; studyId?: string; jobId?: string } = {}) => {
    const client = createTestQueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
            <OutputsReviewFeedbackProviderShare>
                <OutputsDecisionCoordinationProvider
                    orgSlug={ORG}
                    studyId={studyId}
                    jobId={jobId}
                    tabSessionId="tab-this"
                    enabled={monitorEnabled}
                >
                    {children}
                </OutputsDecisionCoordinationProvider>
            </OutputsReviewFeedbackProviderShare>
        </QueryClientProvider>
    )

    return {
        studyId,
        jobId,
        ...renderHook(
            () =>
                useOutputsDecision({
                    orgSlug: ORG,
                    studyId,
                    jobId,
                    labName: LAB,
                    decryptedFiles: [],
                    tabSessionId: 'tab-this',
                }),
            { wrapper },
        ),
    }
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

describe('useOutputsDecision submission failures', () => {
    beforeEach(() => {
        memoryRouter.setCurrentUrl('/start')
    })

    const submitFeedbackOnly = async (rendered: ReturnType<typeof renderDecision>) => {
        act(() => rendered.result.current.onFeedbackChange(lexicalJson('The log leaks an identifier.')))
        act(() => rendered.result.current.onSelect('share-feedback-only'))
        act(() => rendered.result.current.attemptSubmit())
        await act(async () => {
            rendered.result.current.confirmSubmit()
        })
    }

    const staleActionError = () => {
        const error = new Error('Server Action "7f60224d" was not found on the server.')
        error.name = 'UnrecognizedActionError'
        return error
    }

    it('keeps the reviewer on a populated form after an ordinary failure', async () => {
        submitMock.mockRejectedValue(new Error('network unreachable'))
        statusMock.mockResolvedValue(undecided)
        const rendered = renderDecision()

        await submitFeedbackOnly(rendered)

        await waitFor(() => expect(rendered.result.current.failure).not.toBeNull())
        expect(rendered.result.current.failure?.cause).toBe('retry')
        expect(rendered.result.current.confirming).toBeNull()
        expect(rendered.result.current.selected).toBe('share-feedback-only')
        expect(rendered.result.current.feedback).toContain('identifier')
        expect(memoryRouter.asPath).toBe('/start')
    })

    it('classifies an action the running build does not have as a stale client', async () => {
        submitMock.mockRejectedValue(staleActionError())
        statusMock.mockResolvedValue(undecided)
        const rendered = renderDecision()

        await submitFeedbackOnly(rendered)

        await waitFor(() => expect(rendered.result.current.failure?.cause).toBe('stale'))
    })

    // The submit may have committed before its response was lost, and a peer may have won during
    // the attempt. Both mean the review is over, so the reviewer is moved on rather than asked to
    // retry something that already happened.
    it('moves to the decided screen instead of reporting a failure when the job is already decided', async () => {
        submitMock.mockRejectedValue(new Error('response lost'))
        statusMock.mockResolvedValue({
            decided: true,
            decision: 'share-feedback-only',
            decidedById: 'user-1',
            decidedByName: 'Malar Natarajan',
            decidedAt: '2026-08-11T13:53:00.000Z',
        })
        const rendered = renderDecision()

        await submitFeedbackOnly(rendered)

        await waitFor(() => {
            expect(memoryRouter.asPath).toBe(`/${ORG}/study/${rendered.studyId}/review`)
        })
        expect(rendered.result.current.failure).toBeNull()
        expect(rendered.result.current.confirming).toBeNull()
    })

    it('reports a save it cannot confirm as unconfirmed rather than lost', async () => {
        submitMock.mockRejectedValue(new Error('network unreachable'))
        statusMock.mockResolvedValue(undecided)
        const rendered = renderDecision()

        await submitFeedbackOnly(rendered)

        // No editor provider is published in this harness, so the gate cannot confirm a write.
        await waitFor(() => expect(rendered.result.current.failure).not.toBeNull())
        expect(rendered.result.current.failure?.saved).toBe(false)
    })

    it('clears the failure when the reviewer dismisses it', async () => {
        submitMock.mockRejectedValue(new Error('network unreachable'))
        statusMock.mockResolvedValue(undecided)
        const rendered = renderDecision()
        await submitFeedbackOnly(rendered)
        await waitFor(() => expect(rendered.result.current.failure).not.toBeNull())

        act(() => rendered.result.current.dismissFailure())

        expect(rendered.result.current.failure).toBeNull()
    })

    it('navigates and refreshes once the decision succeeds', async () => {
        submitMock.mockResolvedValue({ submitterFullName: 'Malar Natarajan' })
        const rendered = renderDecision()

        await submitFeedbackOnly(rendered)

        await waitFor(() => {
            expect(memoryRouter.asPath).toBe(`/${ORG}/study/${rendered.studyId}/review`)
        })
        expect(rendered.result.current.failure).toBeNull()
    })
})
