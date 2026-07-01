import { vi } from 'vitest'
import {
    describe,
    it,
    expect,
    beforeEach,
    renderHook,
    waitFor,
    createTestQueryWrapper,
    type Mock,
} from '@/tests/unit.helpers'
import { useWorkspaceBuildStatus } from './use-workspace-build-status'
import type { WorkspaceLaunchStatus } from '@/server/coder/types'

vi.mock('@/server/actions/workspaces.actions', () => ({
    getWorkspaceLaunchStatusAction: vi.fn(),
}))

import { getWorkspaceLaunchStatusAction } from '@/server/actions/workspaces.actions'

const statusMock = getWorkspaceLaunchStatusAction as unknown as Mock
const studyId = 'study-1'

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
    beforeEach(() => {
        vi.clearAllMocks()
        statusMock.mockResolvedValue(status())
    })

    it('does not poll while disabled', () => {
        renderHook(() => useWorkspaceBuildStatus({ studyId, enabled: false }), {
            wrapper: createTestQueryWrapper(),
        })
        expect(statusMock).not.toHaveBeenCalled()
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
        // new lines arrived on the first poll, so a lastUpdated timestamp is stamped
        expect(result.current.lastUpdatedAt).toBeInstanceOf(Date)
        expect(result.current.isPolling).toBe(true)
        expect(statusMock).toHaveBeenCalledWith({ studyId, cursors: undefined })
    })

    it('surfaces the url and stops polling once ready', async () => {
        statusMock.mockResolvedValue(status({ ready: true, url: 'https://ws.example.com' }))

        const { result } = renderHook(() => useWorkspaceBuildStatus({ studyId, enabled: true }), {
            wrapper: createTestQueryWrapper(),
        })

        await waitFor(() => expect(result.current.ready).toBe(true))
        expect(result.current.url).toBe('https://ws.example.com')
        expect(result.current.isPolling).toBe(false)
    })

    it('stops polling on a failed build', async () => {
        statusMock.mockResolvedValue(status({ failed: true, reason: 'boom' }))

        const { result } = renderHook(() => useWorkspaceBuildStatus({ studyId, enabled: true }), {
            wrapper: createTestQueryWrapper(),
        })

        await waitFor(() => expect(result.current.failed).toBe(true))
        expect(result.current.reason).toBe('boom')
        expect(result.current.isPolling).toBe(false)
    })
})
