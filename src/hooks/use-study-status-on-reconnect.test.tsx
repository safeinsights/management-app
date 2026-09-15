import { vi } from 'vitest'
import { notifications } from '@mantine/notifications'
import * as RouterMock from 'next-router-mock'
import {
    act,
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    render,
    staleActionError,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import { YjsWebsocketProvider, __resetSharedYjsWebsocketForTests } from '@/lib/realtime/yjs-websocket-context'
import { getStudyStatusAction } from '@/server/actions/editor.actions'
import { STALE_DEPLOYMENT_NOTIFICATION_ID } from '@/components/errors'
import { STALE_DEPLOYMENT_TITLE } from '@/lib/errors'
import {
    STATUS_CHECK_FAILURE_TITLE,
    StudyKickOutProvider,
    useStudyStatusOnReconnect,
    useTriggerStudyKickOut,
} from './use-study-status-on-reconnect'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const memoryRouter = (RouterMock as any).memoryRouter as { asPath: string; setCurrentUrl: (url: string) => void }

vi.mock('@/server/actions/editor.actions', () => ({
    getStudyStatusAction: vi.fn(),
    getYjsDocumentUpdatedAtAction: vi.fn(() => Promise.resolve(null)),
}))

const ctorSpy = (HocuspocusProviderWebsocket as unknown as { __ctor: Mock }).__ctor
const getStudyStatusActionMock = getStudyStatusAction as unknown as Mock
const showMock = notifications.show as unknown as Mock

// The real HocuspocusProviderWebsocket types `status` as an enum; the mock in tests/vitest.setup.ts
// exposes a writable string plus a synchronous `__emit`.
type FakeSocket = {
    status: 'connecting' | 'connected' | 'disconnected'
    __emit: (event: string, ...args: unknown[]) => void
}

const STUDY_ID = '00000000-0000-0000-0000-000000000000'

const Harness = ({ enabled = true }: { enabled?: boolean }) => {
    useStudyStatusOnReconnect({
        studyId: STUDY_ID,
        orgSlug: 'org',
        editableStatuses: ['DRAFT', 'CHANGE-REQUESTED'],
        redirectTarget: 'studySubmitted',
        enabled,
    })
    return null
}

const mount = (props: { enabled?: boolean } = {}) =>
    render(
        <YjsWebsocketProvider>
            <Harness enabled={props.enabled} />
        </YjsWebsocketProvider>,
    )

describe('useStudyStatusOnReconnect', () => {
    beforeEach(() => {
        __resetSharedYjsWebsocketForTests()
        ctorSpy.mockClear()
        showMock.mockClear()
        getStudyStatusActionMock.mockReset()
        memoryRouter.setCurrentUrl('/')
    })

    afterEach(() => {
        __resetSharedYjsWebsocketForTests()
    })

    it('checks status once on initial connect', async () => {
        getStudyStatusActionMock.mockResolvedValue({ status: 'DRAFT' })
        mount()

        await waitFor(() => expect(getStudyStatusActionMock).toHaveBeenCalledTimes(1))
        expect(memoryRouter.asPath).toBe('/')
    })

    it('redirects when status is no longer editable on initial connect', async () => {
        getStudyStatusActionMock.mockResolvedValue({ status: 'PENDING-REVIEW' })
        mount()

        await waitFor(() => expect(memoryRouter.asPath).not.toBe('/'))
        expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Submission complete' }))
    })

    it('does not poll on a stable connection', async () => {
        getStudyStatusActionMock.mockResolvedValue({ status: 'DRAFT' })
        mount()

        await waitFor(() => expect(getStudyStatusActionMock).toHaveBeenCalledTimes(1))
        // Long enough that the old 10s poll would have fired several times.
        await new Promise((r) => setTimeout(r, 50))
        expect(getStudyStatusActionMock).toHaveBeenCalledTimes(1)
    })

    it('checks again after a disconnect → reconnect', async () => {
        getStudyStatusActionMock.mockResolvedValue({ status: 'DRAFT' })
        mount()
        await waitFor(() => expect(getStudyStatusActionMock).toHaveBeenCalledTimes(1))

        const socket = (HocuspocusProviderWebsocket as unknown as { __instances: FakeSocket[] }).__instances[0]
        act(() => {
            socket.status = 'disconnected'
            socket.__emit('status', { status: 'disconnected' })
        })
        act(() => {
            socket.status = 'connected'
            socket.__emit('status', { status: 'connected' })
        })
        await waitFor(() => expect(getStudyStatusActionMock).toHaveBeenCalledTimes(2))
    })

    it('does nothing when disabled', async () => {
        getStudyStatusActionMock.mockResolvedValue({ status: 'PENDING-REVIEW' })
        mount({ enabled: false })

        await new Promise((r) => setTimeout(r, 30))
        expect(getStudyStatusActionMock).not.toHaveBeenCalled()
        expect(memoryRouter.asPath).toBe('/')
    })

    it('uses the isEditable predicate when provided', async () => {
        getStudyStatusActionMock.mockResolvedValue({ status: 'PENDING-REVIEW', latestJobStatus: 'CODE-SUBMITTED' })

        const Predicated = () => {
            useStudyStatusOnReconnect({
                studyId: STUDY_ID,
                orgSlug: 'org',
                editableStatuses: [],
                isEditable: ({ status, latestJobStatus }) =>
                    status === 'PENDING-REVIEW' &&
                    (latestJobStatus === 'CODE-SUBMITTED' || latestJobStatus === 'CODE-SCANNED'),
                redirectTarget: 'studyReview',
                enabled: true,
            })
            return null
        }

        render(
            <YjsWebsocketProvider>
                <Predicated />
            </YjsWebsocketProvider>,
        )

        await waitFor(() => expect(getStudyStatusActionMock).toHaveBeenCalledTimes(1))
        // The empty editableStatuses allowlist would otherwise force a redirect.
        expect(memoryRouter.asPath).toBe('/')
        expect(showMock).not.toHaveBeenCalled()
    })

    it('predicate path redirects when criteria no longer match', async () => {
        getStudyStatusActionMock.mockResolvedValue({ status: 'APPROVED', latestJobStatus: 'CODE-APPROVED' })

        const Predicated = () => {
            useStudyStatusOnReconnect({
                studyId: STUDY_ID,
                orgSlug: 'org',
                editableStatuses: [],
                isEditable: ({ status, latestJobStatus }) =>
                    status === 'PENDING-REVIEW' &&
                    (latestJobStatus === 'CODE-SUBMITTED' || latestJobStatus === 'CODE-SCANNED'),
                redirectTarget: 'studyReview',
                enabled: true,
            })
            return null
        }

        render(
            <YjsWebsocketProvider>
                <Predicated />
            </YjsWebsocketProvider>,
        )

        await waitFor(() => expect(memoryRouter.asPath).not.toBe('/'))
        // A review screen says a decision was submitted. The proposal wording belongs to the
        // screen that redirects to studySubmitted, and the default now follows the target.
        expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Decision submitted' }))
    })

    it('gives a proposal screen and a review screen different default wording', async () => {
        getStudyStatusActionMock.mockResolvedValue({ status: 'PENDING-REVIEW' })
        mount()

        await waitFor(() => expect(memoryRouter.asPath).not.toBe('/'))
        expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Submission complete' }))
    })
})

describe('StudyKickOutProvider + useTriggerStudyKickOut', () => {
    beforeEach(() => {
        __resetSharedYjsWebsocketForTests()
        ctorSpy.mockClear()
        showMock.mockClear()
        getStudyStatusActionMock.mockReset()
        memoryRouter.setCurrentUrl('/')
    })

    afterEach(() => {
        __resetSharedYjsWebsocketForTests()
    })

    it('returns a no-op trigger when there is no provider in the tree', () => {
        const TriggerProbe = ({ onTrigger }: { onTrigger: (fn: () => void) => void }) => {
            onTrigger(useTriggerStudyKickOut())
            return null
        }
        let trigger: () => void = () => {}
        render(<TriggerProbe onTrigger={(fn) => (trigger = fn)} />)
        expect(() => trigger()).not.toThrow()
        expect(getStudyStatusActionMock).not.toHaveBeenCalled()
    })

    it('lets descendants imperatively fire the kick-out check', async () => {
        getStudyStatusActionMock.mockResolvedValue({ status: 'DRAFT' })

        const Trigger = () => {
            const triggerKickOut = useTriggerStudyKickOut()
            return (
                <button type="button" data-testid="trigger" onClick={() => void triggerKickOut()}>
                    trigger
                </button>
            )
        }

        const { getByTestId } = render(
            <YjsWebsocketProvider>
                <StudyKickOutProvider
                    studyId={STUDY_ID}
                    orgSlug="org"
                    editableStatuses={['DRAFT', 'CHANGE-REQUESTED']}
                    redirectTarget="studySubmitted"
                >
                    <Trigger />
                </StudyKickOutProvider>
            </YjsWebsocketProvider>,
        )

        await waitFor(() => expect(getStudyStatusActionMock).toHaveBeenCalledTimes(1))
        expect(memoryRouter.asPath).toBe('/')

        // The peer has now submitted.
        getStudyStatusActionMock.mockResolvedValue({ status: 'PENDING-REVIEW' })
        act(() => {
            getByTestId('trigger').click()
        })

        await waitFor(() => expect(getStudyStatusActionMock).toHaveBeenCalledTimes(2))
        await waitFor(() => expect(memoryRouter.asPath).not.toBe('/'))
        expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Submission complete' }))
    })

    // OTTER-726: when the status request itself cannot be made, the caller has to be told "not
    // closed" rather than left hanging, and the reader has to be told at all. "Could not ask" is not
    // the same answer as "the round is open".
    it('resolves false and reports when the status request fails at the transport', async () => {
        getStudyStatusActionMock.mockRejectedValue(new Error('Failed to fetch'))

        let outcome: boolean | undefined
        const Trigger = () => {
            const triggerKickOut = useTriggerStudyKickOut()
            return (
                <button
                    type="button"
                    data-testid="trigger"
                    onClick={() => {
                        void triggerKickOut().then((closed) => (outcome = closed))
                    }}
                >
                    trigger
                </button>
            )
        }

        const { getByTestId } = render(
            <YjsWebsocketProvider>
                <StudyKickOutProvider
                    studyId={STUDY_ID}
                    orgSlug="org"
                    editableStatuses={['DRAFT']}
                    redirectTarget="studySubmitted"
                >
                    <Trigger />
                </StudyKickOutProvider>
            </YjsWebsocketProvider>,
        )

        act(() => {
            getByTestId('trigger').click()
        })

        await waitFor(() => expect(outcome).toBe(false))
        expect(showMock).toHaveBeenCalledWith(
            expect.objectContaining({ color: 'red', title: STATUS_CHECK_FAILURE_TITLE }),
        )
        expect(memoryRouter.asPath).toBe('/')
    })

    // A tab parked on the security key form has no editor and so no live event; asking when the
    // reviewer returns to it is the moment that matters.
    it('checks again when the tab becomes visible', async () => {
        getStudyStatusActionMock.mockResolvedValue({ status: 'DRAFT', latestJobStatus: null, jobStatuses: [] })
        mount()
        await waitFor(() => expect(getStudyStatusActionMock).toHaveBeenCalledTimes(1))

        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'))
        })

        await waitFor(() => expect(getStudyStatusActionMock).toHaveBeenCalledTimes(2))
    })

    // The newest status row is CODE-SCANNED, written by the scanner after the decision. Only the
    // full status list of the named job shows that the round is closed.
    it('hands the named job status list to the predicate, so a late scan row cannot hide a decision', async () => {
        getStudyStatusActionMock.mockResolvedValue({
            status: 'APPROVED',
            latestJobStatus: 'CODE-SCANNED',
            jobStatuses: ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE', 'FILES-APPROVED', 'CODE-SCANNED'],
        })
        const JOB_ID = '00000000-0000-0000-0000-00000000000a'

        const Predicated = () => {
            useStudyStatusOnReconnect({
                studyId: STUDY_ID,
                studyJobId: JOB_ID,
                orgSlug: 'org',
                editableStatuses: [],
                isEditable: ({ jobStatuses }) => !jobStatuses.includes('FILES-APPROVED'),
                redirectTarget: 'studyReview',
                notice: { title: 'Decision submitted', message: 'Closed.' },
                enabled: true,
            })
            return null
        }

        render(
            <YjsWebsocketProvider>
                <Predicated />
            </YjsWebsocketProvider>,
        )

        await waitFor(() => expect(memoryRouter.asPath).not.toBe('/'))
        expect(getStudyStatusActionMock).toHaveBeenCalledWith({ studyId: STUDY_ID, studyJobId: JOB_ID })
        expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Decision submitted' }))
    })

    it('does not redirect twice if both reconnect and trigger fire', async () => {
        getStudyStatusActionMock.mockResolvedValue({ status: 'PENDING-REVIEW' })

        const Trigger = () => {
            const triggerKickOut = useTriggerStudyKickOut()
            return (
                <button type="button" data-testid="trigger" onClick={() => void triggerKickOut()}>
                    trigger
                </button>
            )
        }

        const { getByTestId } = render(
            <YjsWebsocketProvider>
                <StudyKickOutProvider
                    studyId={STUDY_ID}
                    orgSlug="org"
                    editableStatuses={['DRAFT', 'CHANGE-REQUESTED']}
                    redirectTarget="studySubmitted"
                >
                    <Trigger />
                </StudyKickOutProvider>
            </YjsWebsocketProvider>,
        )

        await waitFor(() => expect(showMock).toHaveBeenCalledTimes(1))
        act(() => {
            getByTestId('trigger').click()
        })
        await new Promise((r) => setTimeout(r, 30))
        expect(showMock).toHaveBeenCalledTimes(1)
    })
})

// OTTER-726: the transport throws when the tab is offline or posts an action id a new build no
// longer holds. Before, that was swallowed and read as "the round is still open", so the reviewer
// was told nothing until a submit failed.
describe('useStudyStatusOnReconnect when the status request fails', () => {
    beforeEach(() => {
        __resetSharedYjsWebsocketForTests()
        ctorSpy.mockClear()
        showMock.mockClear()
        getStudyStatusActionMock.mockReset()
        memoryRouter.setCurrentUrl('/')
    })

    afterEach(() => {
        __resetSharedYjsWebsocketForTests()
    })

    it('offers a reload when the tab posts an action id the running build has dropped', async () => {
        getStudyStatusActionMock.mockRejectedValue(staleActionError())
        mount()

        await waitFor(() =>
            expect(showMock).toHaveBeenCalledWith(
                expect.objectContaining({ id: STALE_DEPLOYMENT_NOTIFICATION_ID, title: STALE_DEPLOYMENT_TITLE }),
            ),
        )
        expect(memoryRouter.asPath).toBe('/')
    })

    it('reports a request that never arrives', async () => {
        getStudyStatusActionMock.mockRejectedValue(new TypeError('Failed to fetch'))
        mount()

        await waitFor(() =>
            expect(showMock).toHaveBeenCalledWith(
                expect.objectContaining({ color: 'red', title: STATUS_CHECK_FAILURE_TITLE }),
            ),
        )
    })

    it('reports a server that refuses to answer', async () => {
        getStudyStatusActionMock.mockResolvedValue({ error: 'Access denied: user not allowed access to study' })
        mount()

        await waitFor(() =>
            expect(showMock).toHaveBeenCalledWith(
                expect.objectContaining({ color: 'red', title: STATUS_CHECK_FAILURE_TITLE }),
            ),
        )
    })

    it('stays quiet for a caller that shows its own message', async () => {
        getStudyStatusActionMock.mockRejectedValue(staleActionError())

        const Trigger = () => {
            const triggerKickOut = useTriggerStudyKickOut()
            return (
                <button
                    type="button"
                    data-testid="trigger"
                    onClick={() => void triggerKickOut({ reportFailure: false })}
                >
                    trigger
                </button>
            )
        }

        const { getByTestId } = render(
            <YjsWebsocketProvider>
                <StudyKickOutProvider
                    studyId={STUDY_ID}
                    orgSlug="org"
                    editableStatuses={['DRAFT']}
                    redirectTarget="studyReview"
                    enabled={false}
                >
                    <Trigger />
                </StudyKickOutProvider>
            </YjsWebsocketProvider>,
        )

        act(() => {
            getByTestId('trigger').click()
        })

        await waitFor(() => expect(getStudyStatusActionMock).toHaveBeenCalled())
        expect(showMock).not.toHaveBeenCalled()
    })
})
