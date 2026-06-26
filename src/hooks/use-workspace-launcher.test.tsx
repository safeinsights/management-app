import { vi } from 'vitest'
import {
    describe,
    it,
    expect,
    beforeEach,
    renderHook,
    waitFor,
    act,
    faker,
    createTestQueryWrapper,
    type Mock,
} from '@/tests/unit.helpers'
import { useWorkspaceLauncher } from './use-workspace-launcher'
import type { WorkspaceLaunchStatus } from '@/server/coder/types'

vi.mock('@/server/actions/workspaces.actions', () => ({
    ensureWorkspaceAction: vi.fn(),
    getWorkspaceLaunchStatusAction: vi.fn(),
}))

vi.mock('@/components/errors', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/components/errors')>()),
    reportError: vi.fn(),
}))

const mockWindowOpen = vi.fn()
Object.defineProperty(window, 'open', {
    value: mockWindowOpen,
    writable: true,
})

import { ensureWorkspaceAction, getWorkspaceLaunchStatusAction } from '@/server/actions/workspaces.actions'
import { reportError } from '@/components/errors'
import { notifications } from '@mantine/notifications'

const studyId = faker.string.uuid()

const ensureMock = ensureWorkspaceAction as unknown as Mock
const statusMock = getWorkspaceLaunchStatusAction as unknown as Mock

const readyStatus = (url = 'https://workspace.example.com'): WorkspaceLaunchStatus => ({
    phase: 'ready',
    buildStatus: 'running',
    ready: true,
    failed: false,
    reason: 'workspace ready',
    lastLogAt: '2020-01-01T00:00:05Z',
    cursors: { build: 3, agents: {} },
    url,
})

const provisioningStatus = (): WorkspaceLaunchStatus => ({
    phase: 'provisioning',
    buildStatus: 'running',
    ready: false,
    failed: false,
    reason: 'build status=running, no resources yet',
    lastLogAt: '2020-01-01T00:00:01Z',
    cursors: { build: 1, agents: {} },
    url: null,
})

const failedStatus = (reason = 'terraform exploded'): WorkspaceLaunchStatus => ({
    phase: 'failed',
    buildStatus: 'failed',
    ready: false,
    failed: true,
    reason,
    lastLogAt: null,
    cursors: { build: null, agents: {} },
    url: null,
})

describe('useWorkspaceLauncher', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockWindowOpen.mockReturnValue({ closed: false })
        ensureMock.mockResolvedValue({ success: true, workspace: { id: 'workspace-456' } })
        statusMock.mockResolvedValue(provisioningStatus())
    })

    describe('initial state', () => {
        it('should return initial state correctly', () => {
            const { result } = renderHook(() => useWorkspaceLauncher({ studyId }), {
                wrapper: createTestQueryWrapper(),
            })

            expect(result.current.isLaunching).toBe(false)
            expect(result.current.isCreatingWorkspace).toBe(false)
            expect(result.current.error).toBeNull()
            expect(typeof result.current.launchWorkspace).toBe('function')
            expect(typeof result.current.clearError).toBe('function')
        })
    })

    describe('launchWorkspace', () => {
        it('should set isLaunching true while the ensure mutation is in flight', async () => {
            ensureMock.mockImplementation(() => new Promise(() => {})) // never resolves

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId }), {
                wrapper: createTestQueryWrapper(),
            })

            act(() => result.current.launchWorkspace())

            await waitFor(() => expect(result.current.isLaunching).toBe(true))
            expect(result.current.isCreatingWorkspace).toBe(true)
        })

        it('should stay launching while the workspace is still provisioning', async () => {
            const { result } = renderHook(() => useWorkspaceLauncher({ studyId }), {
                wrapper: createTestQueryWrapper(),
            })

            act(() => result.current.launchWorkspace())

            await waitFor(() => expect(statusMock).toHaveBeenCalled())
            await waitFor(() => expect(result.current.phase).toBe('provisioning'))
            expect(result.current.isLaunching).toBe(true)
            expect(result.current.lastLogAt).toBe('2020-01-01T00:00:01Z')
        })

        it('should poll the launch status with cursors after the ensure mutation', async () => {
            const { result } = renderHook(() => useWorkspaceLauncher({ studyId }), {
                wrapper: createTestQueryWrapper(),
            })

            act(() => result.current.launchWorkspace())

            await waitFor(() => expect(statusMock).toHaveBeenCalledWith({ studyId, cursors: undefined }))
        })

        it('should open the workspace in a new tab once the status reports a url', async () => {
            const url = 'https://workspace.example.com'
            statusMock.mockResolvedValue(readyStatus(url))

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId }), {
                wrapper: createTestQueryWrapper(),
            })

            act(() => result.current.launchWorkspace())

            await waitFor(() => {
                expect(mockWindowOpen).toHaveBeenCalledWith(url, `ide-for-study-${studyId}`)
                expect(result.current.isLaunching).toBe(false)
            })
        })

        // A blocked popup is not a launch failure: the workspace launched fine and the user gets a
        // clickable fallback notification, so the hook must NOT surface it as `error`.
        it('should show fallback notification without erroring when popup is blocked', async () => {
            mockWindowOpen.mockReturnValue(null)
            statusMock.mockResolvedValue(readyStatus())

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId }), {
                wrapper: createTestQueryWrapper(),
            })

            act(() => result.current.launchWorkspace())

            await waitFor(() =>
                expect(notifications.show).toHaveBeenCalledWith(
                    expect.objectContaining({ title: 'Popup blocked', color: 'yellow', autoClose: false }),
                ),
            )
            expect(result.current.error).toBeNull()
        })

        it('should detect popup blocked when window.closed is true', async () => {
            mockWindowOpen.mockReturnValue({ closed: true })
            statusMock.mockResolvedValue(readyStatus())

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId }), {
                wrapper: createTestQueryWrapper(),
            })

            act(() => result.current.launchWorkspace())

            await waitFor(() =>
                expect(notifications.show).toHaveBeenCalledWith(
                    expect.objectContaining({ title: 'Popup blocked', color: 'yellow' }),
                ),
            )
            expect(result.current.error).toBeNull()
        })
    })

    describe('error handling', () => {
        it('should surface an ensure (create/start) mutation error', async () => {
            ensureMock.mockResolvedValue({ error: 'Failed to create workspace' })

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId }), {
                wrapper: createTestQueryWrapper(),
            })

            act(() => result.current.launchWorkspace())

            await waitFor(() => {
                expect(result.current.error?.message).toBe('Failed to create workspace')
                expect(result.current.isLaunching).toBe(false)
            })
        })

        it('should surface a friendly fallback for a non-string ensure error', async () => {
            ensureMock.mockResolvedValue({ error: { code: 500 } })

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId }), {
                wrapper: createTestQueryWrapper(),
            })

            act(() => result.current.launchWorkspace())

            await waitFor(() => expect(result.current.error?.message).toBe('Failed to launch IDE'))
        })

        it('should surface a status polling error', async () => {
            statusMock.mockResolvedValue({ error: 'workspace not found' })

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId }), {
                wrapper: createTestQueryWrapper(),
            })

            act(() => result.current.launchWorkspace())

            await waitFor(() => {
                expect(result.current.error).not.toBeNull()
                expect(result.current.isLaunching).toBe(false)
            })
        })

        it('should surface a failed build as an error using its reason', async () => {
            statusMock.mockResolvedValue(failedStatus('terraform exploded'))

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId }), {
                wrapper: createTestQueryWrapper(),
            })

            act(() => result.current.launchWorkspace())

            await waitFor(() => {
                expect(result.current.phase).toBe('failed')
                expect(result.current.error?.message).toBe('terraform exploded')
                expect(result.current.isLaunching).toBe(false)
            })
        })

        it('should report ensure failures to Sentry/notifications', async () => {
            ensureMock.mockResolvedValue({ error: 'boom' })

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId }), {
                wrapper: createTestQueryWrapper(),
            })

            act(() => result.current.launchWorkspace())

            await waitFor(() => expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'Failed to launch IDE'))
        })

        it('should report a failed build to Sentry/notifications', async () => {
            statusMock.mockResolvedValue(failedStatus())

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId }), {
                wrapper: createTestQueryWrapper(),
            })

            act(() => result.current.launchWorkspace())

            await waitFor(() => expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'Failed to launch IDE'))
        })
    })

    describe('clearError and retry', () => {
        it('should clear error state', async () => {
            ensureMock.mockResolvedValue({ error: 'Some error' })

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId }), {
                wrapper: createTestQueryWrapper(),
            })

            act(() => result.current.launchWorkspace())
            await waitFor(() => expect(result.current.error).not.toBeNull())

            act(() => result.current.clearError())
            await waitFor(() => expect(result.current.error).toBeNull())
        })

        it('should allow retrying after an ensure error', async () => {
            ensureMock.mockResolvedValueOnce({ error: 'First attempt failed' }).mockResolvedValueOnce({
                success: true,
                workspace: { id: 'workspace-789' },
            })
            statusMock.mockResolvedValue(readyStatus())

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId }), {
                wrapper: createTestQueryWrapper(),
            })

            act(() => result.current.launchWorkspace())
            await waitFor(() => expect(result.current.error).not.toBeNull())

            act(() => result.current.launchWorkspace())
            await waitFor(() => {
                expect(mockWindowOpen).toHaveBeenCalled()
                expect(result.current.error).toBeNull()
            })
        })
    })
})
