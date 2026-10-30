import { vi } from 'vitest'
import {
    describe,
    it,
    expect,
    beforeEach,
    renderHook,
    waitFor,
    waitForPendingQueries,
    createTestQueryWrapper,
    db,
    insertTestStudyOnly,
    mockSessionWithTestData,
    stubCoder,
    type Mock,
} from '@/tests/unit.helpers'
import { useWorkspaceBuildStatus } from './use-workspace-build-status'
import { getCoderWorkspaceLaunchStatus } from '@/server/coder'
import type { WorkspaceLaunchStatus } from '@/server/coder/types'

const coderStatusMock = getCoderWorkspaceLaunchStatus as unknown as Mock

const status = (overrides: Partial<WorkspaceLaunchStatus> = {}): WorkspaceLaunchStatus => ({
    buildStatus: 'running',
    buildLogLines: ['building image'],
    agentStatus: { lifecycle: 'starting', status: 'connecting', codeServer: 'initializing' },
    agentLogLines: ['agent up'],
    ready: false,
    failed: false,
    reason: 'building',
    cursors: { build: 2, agent: 5 },
    url: null,
    ...overrides,
})

describe('useWorkspaceBuildStatus', () => {
    let studyId: string

    beforeEach(async () => {
        vi.clearAllMocks()
        stubCoder(status())
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        // The action answers only the researcher the IDE is locked to, which a launch would claim.
        await db.updateTable('study').set({ ideOwnerId: user.id }).where('id', '=', study.id).execute()
        studyId = study.id
    })

    it('does not poll while disabled', async () => {
        renderHook(() => useWorkspaceBuildStatus({ studyId, enabled: false }), {
            wrapper: createTestQueryWrapper(),
        })
        await waitForPendingQueries()
        expect(coderStatusMock).not.toHaveBeenCalled()
    })

    it('maps a provisioning status and keeps polling', async () => {
        const { result } = renderHook(() => useWorkspaceBuildStatus({ studyId, enabled: true }), {
            wrapper: createTestQueryWrapper(),
        })

        await waitFor(() => expect(result.current.reason).toBe('building'))
        expect(result.current.ready).toBe(false)
        expect(result.current.failed).toBe(false)
        expect(result.current.buildLog).toBe('building image')
        expect(result.current.agentLog).toBe('agent up')
        expect(result.current.lastUpdatedAt).toBeInstanceOf(Date)
        expect(result.current.isPolling).toBe(true)
        expect(coderStatusMock).toHaveBeenCalledWith(studyId, undefined)
    })

    it('surfaces the url and stops polling once ready', async () => {
        coderStatusMock.mockResolvedValue(status({ ready: true, url: 'https://ws.example.com' }))

        const { result } = renderHook(() => useWorkspaceBuildStatus({ studyId, enabled: true }), {
            wrapper: createTestQueryWrapper(),
        })

        await waitFor(() => expect(result.current.ready).toBe(true))
        expect(result.current.url).toBe('https://ws.example.com')
        expect(result.current.isPolling).toBe(false)
    })

    it('stops polling on a failed build', async () => {
        coderStatusMock.mockResolvedValue(status({ failed: true, reason: 'boom' }))

        const { result } = renderHook(() => useWorkspaceBuildStatus({ studyId, enabled: true }), {
            wrapper: createTestQueryWrapper(),
        })

        await waitFor(() => expect(result.current.failed).toBe(true))
        expect(result.current.reason).toBe('boom')
        expect(result.current.isPolling).toBe(false)
    })

    // OTTER-824: the cache outlives the page, so a later mount must not read an earlier launch.
    it('reports nothing while disabled even when the cache holds a ready status', async () => {
        coderStatusMock.mockResolvedValue(status({ ready: true, url: 'https://ws.example.com' }))
        const wrapper = createTestQueryWrapper()

        const first = renderHook(() => useWorkspaceBuildStatus({ studyId, enabled: true }), { wrapper })
        await waitFor(() => expect(first.result.current.url).toBe('https://ws.example.com'))
        first.unmount()

        const { result } = renderHook(() => useWorkspaceBuildStatus({ studyId, enabled: false }), { wrapper })
        expect(result.current.url).toBeNull()
        expect(result.current.ready).toBe(false)
        expect(result.current.buildLog).toBe('')
        expect(result.current.isPolling).toBe(false)
    })

    it('reports no failure while disabled even when the cache holds a failed status', async () => {
        coderStatusMock.mockResolvedValue(status({ failed: true, reason: 'boom' }))
        const wrapper = createTestQueryWrapper()

        const first = renderHook(() => useWorkspaceBuildStatus({ studyId, enabled: true }), { wrapper })
        await waitFor(() => expect(first.result.current.failed).toBe(true))
        first.unmount()

        const { result } = renderHook(() => useWorkspaceBuildStatus({ studyId, enabled: false }), { wrapper })
        expect(result.current.failed).toBe(false)
        expect(result.current.reason).toBeNull()
        expect(result.current.error).toBeNull()
    })

    it('reports no error while disabled even when the cache holds a polling error', async () => {
        coderStatusMock.mockRejectedValue(new Error('network down'))
        const wrapper = createTestQueryWrapper()

        const first = renderHook(() => useWorkspaceBuildStatus({ studyId, enabled: true }), { wrapper })
        await waitFor(() => expect(first.result.current.error?.message).toBe('network down'))
        first.unmount()

        const { result } = renderHook(() => useWorkspaceBuildStatus({ studyId, enabled: false }), { wrapper })
        expect(result.current.error).toBeNull()
        expect(result.current.isPolling).toBe(false)
    })
})
