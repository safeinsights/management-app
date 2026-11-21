import type { ReactNode } from 'react'
import { useParams } from 'next/navigation'
import { memoryRouter } from 'next-router-mock'
import {
    act,
    advanceTimers,
    createTestQueryClient,
    emitStudyEvent,
    QueryClientProvider,
    studyEventsChannels,
    afterEach,
    beforeEach,
    describe,
    expect,
    faker,
    fakeTimeouts,
    it,
    mockClerkSession,
    renderHook,
    restoreRealTimers,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { YjsWebsocketProvider, __resetSharedYjsWebsocketForTests } from '@/lib/realtime/yjs-websocket-context'
import { StudyEventsProvider } from './use-study-events'
import { useCodeSubmissionPresence } from './use-code-submission-presence'

type FakeProvider = {
    configuration: { name?: string }
    awareness: { getLocalState: () => Record<string, unknown> | null }
    sendStateless: Mock
    destroy: Mock
    __emit: (event: string, ...args: unknown[]) => void
}

const allProviders = () => (HocuspocusProvider as unknown as { __instances: FakeProvider[] }).__instances
const providers = () => allProviders().filter((provider) => provider.configuration.name?.startsWith('code-submission-'))

describe('useCodeSubmissionPresence', () => {
    let studyId: string
    let wrapper: (props: { children: ReactNode }) => ReactNode

    beforeEach(() => {
        __resetSharedYjsWebsocketForTests()
        allProviders().length = 0
        studyId = faker.string.uuid()
        const client = createTestQueryClient()
        wrapper = ({ children }) => (
            <QueryClientProvider client={client}>
                <YjsWebsocketProvider>
                    <StudyEventsProvider studyId={studyId}>{children}</StudyEventsProvider>
                </YjsWebsocketProvider>
            </QueryClientProvider>
        )
        ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab' })
        memoryRouter.setCurrentUrl('/start')
        mockClerkSession({
            clerkUserId: 'user_erin',
            userId: faker.string.uuid(),
            orgSlug: 'lab',
            firstName: 'Erin',
            lastName: 'Lab',
        })
    })

    afterEach(restoreRealTimers)

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

    it('sends nothing itself and releases the room on unmount', async () => {
        const { unmount } = renderHook(() => useCodeSubmissionPresence(studyId), { wrapper })
        await waitFor(() => expect(providers()).toHaveLength(1))
        const provider = providers()[0]

        unmount()
        expect(provider.sendStateless).not.toHaveBeenCalled()
        expect(provider.destroy).toHaveBeenCalledTimes(1)
    })

    it('kicks this tab to the study view when another tab submits the code', async () => {
        renderHook(() => useCodeSubmissionPresence(studyId), { wrapper })
        await waitFor(() => expect(providers()).toHaveLength(1))

        await waitFor(() => expect(studyEventsChannels(studyId)).toHaveLength(1))

        act(() => emitStudyEvent({ studyId, change: 'code-submitted', submittedBy: { name: 'Erin Lab' } }))

        expect(memoryRouter.asPath).toBe(`/lab/study/${studyId}/view`)
    })

    it('opens nothing while disabled', async () => {
        fakeTimeouts()
        renderHook(() => useCodeSubmissionPresence(studyId, false), { wrapper })
        await advanceTimers(30_000)
        expect(providers()).toHaveLength(0)
    })
})
