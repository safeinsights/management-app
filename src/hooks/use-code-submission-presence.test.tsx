import type { ReactNode } from 'react'
import {
    beforeEach,
    describe,
    expect,
    faker,
    it,
    mockClerkSession,
    renderHook,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { YjsWebsocketProvider, __resetSharedYjsWebsocketForTests } from '@/lib/realtime/yjs-websocket-context'
import { useCodeSubmissionPresence } from './use-code-submission-presence'

type FakeProvider = {
    configuration: { name?: string }
    awareness: { getLocalState: () => Record<string, unknown> | null }
    sendStateless: Mock
    destroy: Mock
}

const providers = () => (HocuspocusProvider as unknown as { __instances: FakeProvider[] }).__instances

const wrapper = ({ children }: { children: ReactNode }) => <YjsWebsocketProvider>{children}</YjsWebsocketProvider>

describe('useCodeSubmissionPresence', () => {
    let studyId: string

    beforeEach(() => {
        __resetSharedYjsWebsocketForTests()
        providers().length = 0
        studyId = faker.string.uuid()
        mockClerkSession({
            clerkUserId: 'user_erin',
            userId: faker.string.uuid(),
            orgSlug: 'lab',
            firstName: 'Erin',
            lastName: 'Lab',
        })
    })

    it('opens the study code room and announces the viewer under the editor awareness shape', async () => {
        renderHook(() => useCodeSubmissionPresence(studyId), { wrapper })

        await waitFor(() => expect(providers()).toHaveLength(1))
        const provider = providers()[0]
        expect(provider.configuration.name).toBe(`code-submission-${studyId}`)
        await waitFor(() =>
            expect(provider.awareness.getLocalState()).toMatchObject({
                name: 'Erin Lab',
                awarenessData: { userId: 'user_erin' },
            }),
        )
    })

    it('broadcasts code-submitted from this tab and releases the room on unmount', async () => {
        const { result, unmount } = renderHook(() => useCodeSubmissionPresence(studyId), { wrapper })
        await waitFor(() => expect(providers()).toHaveLength(1))

        result.current.broadcastSubmitted()

        const provider = providers()[0]
        expect(provider.sendStateless).toHaveBeenCalledTimes(1)
        expect(JSON.parse(provider.sendStateless.mock.calls[0][0] as string)).toEqual({
            type: 'code-submitted',
            studyId,
            submittedByTabId: result.current.tabSessionId,
            submittedByClerkId: 'user_erin',
            submittedByName: 'Erin Lab',
        })

        unmount()
        expect(provider.destroy).toHaveBeenCalledTimes(1)
    })

    it('opens nothing while disabled', async () => {
        renderHook(() => useCodeSubmissionPresence(studyId, false), { wrapper })
        await new Promise((r) => setTimeout(r, 0))
        expect(providers()).toHaveLength(0)
    })
})
