import { useEffect, type ReactNode } from 'react'
import { useAuth } from '@clerk/nextjs'
import { memoryRouter } from 'next-router-mock'
import { useTanStackQuery } from '@/common'
import {
    act,
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
    vi,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { queryKeys } from '@/lib/query-keys'
import { YjsWebsocketProvider, __resetSharedYjsWebsocketForTests } from '@/lib/realtime/yjs-websocket-context'
import type { StudyEvent } from '@/lib/collaboration-documents'
import { StudyEventsProvider, useStudyEvents } from './use-study-events'

const routerRefresh = () => (memoryRouter as unknown as { refresh: Mock }).refresh

describe('StudyEventsProvider', () => {
    let studyId: string
    let jobId: string

    beforeEach(() => {
        __resetSharedYjsWebsocketForTests()
        studyId = faker.string.uuid()
        jobId = faker.string.uuid()
        routerRefresh().mockClear()
    })

    // Two active queries, one under the study and one under a job, counting their fetches, plus a
    // subscriber that records what reaches the page's listeners.
    const mount = ({ singleUserEditing = false } = {}) => {
        const client = createTestQueryClient()
        const fetches = { study: 0, job: 0 }
        const received: StudyEvent[] = []
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={client}>
                <YjsWebsocketProvider singleUserEditing={singleUserEditing}>
                    <StudyEventsProvider studyId={studyId}>{children}</StudyEventsProvider>
                </YjsWebsocketProvider>
            </QueryClientProvider>
        )
        const view = renderHook(
            () => {
                useTanStackQuery({
                    queryKey: queryKeys.lastJob(studyId),
                    queryFn: async () => ++fetches.study,
                })
                useTanStackQuery({
                    queryKey: queryKeys.jobFileActivity(jobId, 'org'),
                    queryFn: async () => ++fetches.job,
                })
                const events = useStudyEvents()
                useEffect(() => events.subscribe((event) => received.push(event)), [events])
                return events.tabId
            },
            { wrapper },
        )
        return { ...view, fetches, received }
    }

    const mountConnected = async () => {
        const mounted = mount()
        await waitFor(() => expect(studyEventsChannels(studyId)).toHaveLength(1))
        await waitFor(() => expect(mounted.fetches).toEqual({ study: 1, job: 1 }))
        return mounted
    }

    it("refreshes the study's queries, the named job's queries and the server page on an event", async () => {
        const { fetches, received } = await mountConnected()

        act(() => emitStudyEvent({ studyId, jobId, change: 'job-status' }))

        await waitFor(() => expect(fetches).toEqual({ study: 2, job: 2 }))
        expect(routerRefresh()).toHaveBeenCalledOnce()
        expect(received).toEqual([{ type: 'study-changed', studyId, jobId, change: 'job-status' }])
    })

    it('leaves its own change alone but still tells the page listeners', async () => {
        const { result, fetches, received } = await mountConnected()

        act(() => emitStudyEvent({ studyId, jobId, change: 'code-review-submitted', originTabId: result.current }))

        expect(received).toHaveLength(1)
        expect(routerRefresh()).not.toHaveBeenCalled()
        expect(fetches).toEqual({ study: 1, job: 1 })
    })

    it('keeps one tab id across renders', async () => {
        const { result, rerender } = await mountConnected()
        const tabId = result.current
        rerender()
        expect(result.current).toBe(tabId)
    })

    it('re-reads the study and every job once on an editor resync, and tells the page listeners', async () => {
        const { fetches, received } = await mountConnected()

        act(() => emitStudyEvent({ studyId, change: 'resync' }))

        await waitFor(() => expect(fetches).toEqual({ study: 2, job: 2 }))
        expect(routerRefresh()).toHaveBeenCalledOnce()
        expect(received.map((event) => event.change)).toEqual(['resync'])
    })

    it('recovers on each sync of the channel, and not on a socket status alone', async () => {
        const { fetches, received } = await mountConnected()
        const channel = studyEventsChannels(studyId)[0]

        act(() => channel.__emit('status', { status: 'connected' }))
        expect(routerRefresh()).not.toHaveBeenCalled()

        act(() => channel.__emit('synced', { state: true }))
        await waitFor(() => expect(fetches).toEqual({ study: 2, job: 2 }))
        expect(routerRefresh()).toHaveBeenCalledOnce()

        // After a disconnect the provider syncs again, which is one more recovery.
        act(() => channel.__emit('synced', { state: true }))
        await waitFor(() => expect(fetches).toEqual({ study: 3, job: 3 }))
        expect(routerRefresh()).toHaveBeenCalledTimes(2)
        expect(received).toEqual([])
    })

    it('keeps one channel when Clerk hands back a new getToken', async () => {
        const { rerender } = await mountConnected()
        ;(useAuth as Mock).mockReturnValue({ ...(useAuth as Mock)(), getToken: vi.fn(async () => 'token') })
        rerender()
        expect(studyEventsChannels(studyId)).toHaveLength(1)
    })

    it('opens no channel without a socket, and still gives the tab an id', async () => {
        const { result } = mount({ singleUserEditing: true })
        await waitFor(() => expect(result.current).toEqual(expect.any(String)))
        expect(studyEventsChannels(studyId)).toHaveLength(0)
    })
})
