import type { ReactNode } from 'react'
import { memoryRouter } from 'next-router-mock'
import { notifications } from '@mantine/notifications'
import {
    beforeEach,
    createTestQueryClient,
    describe,
    emitStudyEvent,
    expect,
    faker,
    it,
    QueryClientProvider,
    renderHook,
    studyEventsChannels,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { YjsWebsocketProvider, __resetSharedYjsWebsocketForTests } from '@/lib/realtime/yjs-websocket-context'
import { OUTPUTS_DECIDED_NOTICE } from '@/lib/outputs-review'
import { StudyEventsProvider, useStudyEvents } from './use-study-events'
import { useSubmissionRedirectListener, type SubmissionEventType } from './use-submission-redirect-listener'

const ORG_SLUG = 'test-org'

describe('useSubmissionRedirectListener', () => {
    let studyId: string

    beforeEach(() => {
        __resetSharedYjsWebsocketForTests()
        studyId = faker.string.uuid()
        memoryRouter.setCurrentUrl('/start')
        ;(notifications.show as Mock).mockClear()
    })

    // Mounted under the real study events provider, as the study layout mounts it. Returns this
    // tab's id, which a test sends as originTabId to stand for an event from this tab.
    const mountListener = async (
        types: readonly SubmissionEventType[],
        { jobId, enabled = true }: { jobId?: string; enabled?: boolean } = {},
    ) => {
        const client = createTestQueryClient()
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={client}>
                <YjsWebsocketProvider>
                    <StudyEventsProvider studyId={studyId}>{children}</StudyEventsProvider>
                </YjsWebsocketProvider>
            </QueryClientProvider>
        )
        const { result } = renderHook(
            () => {
                useSubmissionRedirectListener({ orgSlug: ORG_SLUG, studyId, types, jobId, enabled })
                return useStudyEvents().tabId
            },
            { wrapper },
        )
        await waitFor(() => expect(studyEventsChannels(studyId)).toHaveLength(1))
        return result.current
    }

    const lastToast = () => (notifications.show as Mock).mock.calls.at(-1)?.[0]

    it('skips the tab that made the change', async () => {
        const tabId = await mountListener(['proposal-submitted'])
        emitStudyEvent({
            studyId,
            change: 'proposal-submitted',
            submittedBy: { name: 'Alice' },
            orgName: 'Atlas DO',
            originTabId: tabId,
        })
        expect(notifications.show).not.toHaveBeenCalled()
        expect(memoryRouter.asPath).toBe('/start')
    })

    it('closes another tab of the same user on proposal-submitted', async () => {
        await mountListener(['proposal-submitted'])
        emitStudyEvent({
            studyId,
            change: 'proposal-submitted',
            submittedBy: { name: 'Alice' },
            orgName: 'Atlas DO',
            originTabId: 'another-tab',
        })
        expect(lastToast().message).toBe(
            'Alice has proceeded to submit this study proposal to Atlas DO. No further edits are allowed at this point.',
        )
        expect(memoryRouter.asPath).toBe(`/${ORG_SLUG}/study/${studyId}/submitted`)
    })

    it('closes the proposal review on proposal-review-submitted', async () => {
        await mountListener(['proposal-review-submitted'])
        emitStudyEvent({ studyId, change: 'proposal-review-submitted', submittedBy: { name: 'Bob' } })
        expect(lastToast().message).toBe(
            'Bob has proceeded to submit a decision on this study proposal. No further edits are allowed at this point.',
        )
        expect(memoryRouter.asPath).toBe(`/${ORG_SLUG}/study/${studyId}/review`)
    })

    it('closes the code review on code-review-submitted for its job', async () => {
        const jobId = faker.string.uuid()
        await mountListener(['code-review-submitted'], { jobId })
        emitStudyEvent({ studyId, jobId, change: 'code-review-submitted', submittedBy: { name: 'Carol' } })
        expect(lastToast().message).toBe(
            'Carol has proceeded to submit a decision on this output. No further edits are allowed at this point.',
        )
        // Not bare /review, which resolves an approved study forward to the outputs step.
        expect(memoryRouter.asPath).toBe(`/${ORG_SLUG}/study/${studyId}/review/code`)
    })

    // OTTER-753: the lab's code page has the same two-researcher race as the review screens.
    it('closes the code page on code-submitted', async () => {
        await mountListener(['code-submitted'])
        emitStudyEvent({ studyId, change: 'code-submitted', submittedBy: { name: 'Erin' } })
        expect(lastToast().message).toBe(
            'Erin has submitted the code for review. No further edits are allowed at this point.',
        )
        expect(memoryRouter.asPath).toBe(`/${ORG_SLUG}/study/${studyId}/view`)
    })

    // OTTER-726: the outputs round closes for everyone at once, and the reviewer who is still
    // typing has to be told who ended it rather than finding out when their own submit fails.
    it('closes the outputs review on outputs-review-submitted', async () => {
        const jobId = faker.string.uuid()
        await mountListener(['outputs-review-submitted'], { jobId })
        emitStudyEvent({ studyId, jobId, change: 'outputs-review-submitted', submittedBy: { name: 'Dana' } })
        expect(lastToast().message).toBe(
            'Dana has proceeded to submit a decision on this output. No further edits are allowed at this point.',
        )
        // A submit that lost the race reaches the same conclusion through the status backstop, and
        // the shared id keeps that from becoming a second notice.
        expect(lastToast().id).toBe(OUTPUTS_DECIDED_NOTICE.id)
        expect(memoryRouter.asPath).toBe(`/${ORG_SLUG}/study/${studyId}/review`)
    })

    it('redirects once for two events', async () => {
        await mountListener(['proposal-submitted'])
        const event = {
            studyId,
            change: 'proposal-submitted' as const,
            submittedBy: { name: 'Alice' },
            orgName: 'Atlas DO',
        }
        emitStudyEvent(event)
        emitStudyEvent(event)
        expect(notifications.show).toHaveBeenCalledTimes(1)
    })

    it('ignores an event of another type without using up its one redirect', async () => {
        await mountListener(['code-submitted'])
        emitStudyEvent({ studyId, change: 'proposal-review-submitted', submittedBy: { name: 'Bob' } })
        emitStudyEvent({ studyId, change: 'job-status' })
        expect(notifications.show).not.toHaveBeenCalled()

        emitStudyEvent({ studyId, change: 'code-submitted', submittedBy: { name: 'Erin' } })
        expect(memoryRouter.asPath).toBe(`/${ORG_SLUG}/study/${studyId}/view`)
    })

    it('ignores a decision on another job of the study', async () => {
        await mountListener(['code-review-submitted'], { jobId: faker.string.uuid() })
        emitStudyEvent({
            studyId,
            jobId: faker.string.uuid(),
            change: 'code-review-submitted',
            submittedBy: { name: 'Carol' },
        })
        expect(notifications.show).not.toHaveBeenCalled()
        expect(memoryRouter.asPath).toBe('/start')
    })

    it('does nothing when disabled', async () => {
        await mountListener(['proposal-submitted'], { enabled: false })
        emitStudyEvent({
            studyId,
            change: 'proposal-submitted',
            submittedBy: { name: 'Alice' },
            orgName: 'Atlas DO',
        })
        expect(notifications.show).not.toHaveBeenCalled()
    })
})
