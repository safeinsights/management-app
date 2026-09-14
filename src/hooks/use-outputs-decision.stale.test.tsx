import { vi } from 'vitest'
import type { ReactNode } from 'react'
import {
    act,
    createTestQueryWrapper,
    describe,
    expect,
    faker,
    it,
    renderHook,
    staleActionError,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { notifications } from '@mantine/notifications'
import { lexicalJson } from '@/lib/lexical'
import { STALE_DEPLOYMENT_NOTIFICATION_ID } from '@/components/errors'
import { isOutputsReviewEditable, OUTPUTS_DECIDED_NOTICE, OUTPUTS_DECISION_FAILURE } from '@/lib/outputs-review'
import { OutputsReviewFeedbackProviderShare } from '@/lib/realtime/outputs-review-feedback-provider-context'
import { YjsWebsocketProvider } from '@/lib/realtime/yjs-websocket-context'
import { StudyKickOutProvider } from '@/hooks/use-study-status-on-reconnect'
import { submitOutputsDecisionAction } from '@/server/actions/study-job.actions'
import { getStudyStatusAction } from '@/server/actions/editor.actions'
import { useOutputsDecision } from './use-outputs-decision'

vi.mock('@/server/actions/study-job.actions', () => ({ submitOutputsDecisionAction: vi.fn() }))

vi.mock('@/server/actions/editor.actions', () => ({
    getStudyStatusAction: vi.fn(),
    getYjsDocumentUpdatedAtAction: vi.fn(() => Promise.resolve(null)),
}))

const submitMock = submitOutputsDecisionAction as unknown as Mock
const statusMock = getStudyStatusAction as unknown as Mock
const showMock = notifications.show as unknown as Mock

const renderWithBackstop = () => {
    const studyId = faker.string.uuid()
    const jobId = faker.string.uuid()
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
                labName: 'Rice Lab',
                decryptedFiles: [],
                tabSessionId: faker.string.uuid(),
            }),
        { wrapper },
    )
}

// OTTER-726: a deploy under an open tab fails the submit and the backstop's own status request for
// the same reason. Both surfaces can offer a reload, and the reviewer must be given one, not two.
describe('a decision submitted from a page the running build has left behind', () => {
    it('tells the reviewer once, in the wording that names what a reload costs', async () => {
        submitMock.mockRejectedValue(staleActionError())
        statusMock.mockRejectedValue(staleActionError())
        const { result } = renderWithBackstop()

        act(() => result.current.onFeedbackChange(lexicalJson('Outputs look clean, no PII observed.')))
        act(() => result.current.onSelect('share-feedback-only'))
        act(() => result.current.attemptSubmit())
        await act(async () => result.current.confirmSubmit())

        await waitFor(() =>
            expect(showMock).toHaveBeenCalledWith(
                expect.objectContaining({ title: OUTPUTS_DECISION_FAILURE.title, autoClose: false }),
            ),
        )
        const ids = showMock.mock.calls.map(([notification]) => notification.id)
        expect(ids).not.toContain(STALE_DEPLOYMENT_NOTIFICATION_ID)
    })
})
