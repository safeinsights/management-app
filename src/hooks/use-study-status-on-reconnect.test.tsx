import { vi } from 'vitest'
import { notifications } from '@mantine/notifications'
import * as RouterMock from 'next-router-mock'
import { act, afterEach, beforeEach, describe, expect, it, render, waitFor, type Mock } from '@/tests/unit.helpers'
import { HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import { YjsWebsocketProvider, __resetSharedYjsWebsocketForTests } from '@/lib/realtime/yjs-websocket-context'
import { getStudyStatusAction } from '@/server/actions/editor.actions'
import {
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

// The mocked websocket exposes a writable string `status` and a synchronous
// `__emit` driver — see tests/vitest.setup.ts. Tests cast to this shape rather
// than the real `HocuspocusProviderWebsocket` whose `status` is a typed enum.
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
        // Wait long enough that the old 10s poll would have fired multiple times.
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
        // Initial connect sees DRAFT (still editable, no redirect).
        getStudyStatusActionMock.mockResolvedValue({ status: 'DRAFT' })

        const Trigger = () => {
            const triggerKickOut = useTriggerStudyKickOut()
            return (
                <button type="button" data-testid="trigger" onClick={triggerKickOut}>
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

        // Wait for the initial connect check to complete with no redirect.
        await waitFor(() => expect(getStudyStatusActionMock).toHaveBeenCalledTimes(1))
        expect(memoryRouter.asPath).toBe('/')

        // Imperative trigger from the editor: peer has now submitted.
        getStudyStatusActionMock.mockResolvedValue({ status: 'PENDING-REVIEW' })
        act(() => {
            getByTestId('trigger').click()
        })

        await waitFor(() => expect(getStudyStatusActionMock).toHaveBeenCalledTimes(2))
        await waitFor(() => expect(memoryRouter.asPath).not.toBe('/'))
        expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Submission complete' }))
    })

    it('does not redirect twice if both reconnect and trigger fire', async () => {
        getStudyStatusActionMock.mockResolvedValue({ status: 'PENDING-REVIEW' })

        const Trigger = () => {
            const triggerKickOut = useTriggerStudyKickOut()
            return (
                <button type="button" data-testid="trigger" onClick={triggerKickOut}>
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
        // hasRedirectedRef should suppress the second toast.
        await new Promise((r) => setTimeout(r, 30))
        expect(showMock).toHaveBeenCalledTimes(1)
    })
})
