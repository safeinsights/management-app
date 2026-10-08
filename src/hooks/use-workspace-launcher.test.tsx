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
    staleActionError,
    type Mock,
} from '@/tests/unit.helpers'
import { useWorkspaceLauncher } from './use-workspace-launcher'
import type { WorkspaceLaunchStatus } from '@/server/coder/types'

vi.mock('@/server/actions/workspaces.actions', () => ({
    ensureWorkspaceAction: vi.fn(),
    getWorkspaceLaunchStatusAction: vi.fn(),
}))

// Spied rather than stubbed, so the launcher still gets a real event id for the modal's Ref.
vi.mock('@sentry/nextjs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@sentry/nextjs')>()
    return { ...actual, captureException: vi.fn(actual.captureException) }
})

const mockWindowOpen = vi.fn()
Object.defineProperty(window, 'open', {
    value: mockWindowOpen,
    writable: true,
})

import { ensureWorkspaceAction, getWorkspaceLaunchStatusAction } from '@/server/actions/workspaces.actions'
import { STALE_DEPLOYMENT_NOTIFICATION_ID } from '@/components/errors'
import { notifications } from '@mantine/notifications'
import { captureException } from '@sentry/nextjs'

const studyId = faker.string.uuid()

const ensureMock = ensureWorkspaceAction as unknown as Mock
const statusMock = getWorkspaceLaunchStatusAction as unknown as Mock

const readyStatus = (url = 'https://workspace.example.com'): WorkspaceLaunchStatus => ({
    buildStatus: 'running',
    buildLogLines: ['provisioning complete'],
    agentStatus: { lifecycle: 'ready', status: 'connected', codeServer: 'healthy' },
    agentLogLines: ['workspace ready'],
    ready: true,
    failed: false,
    reason: 'workspace ready',
    cursors: { build: 3, agent: 4 },
    url,
})

const provisioningStatus = (): WorkspaceLaunchStatus => ({
    buildStatus: 'running',
    buildLogLines: ['pulling base image'],
    agentStatus: { lifecycle: 'starting', status: 'connecting', codeServer: 'initializing' },
    agentLogLines: [],
    ready: false,
    failed: false,
    reason: 'build status=running, no agent yet',
    cursors: { build: 1, agent: null },
    url: null,
})

const failedStatus = (reason = 'terraform exploded'): WorkspaceLaunchStatus => ({
    buildStatus: 'failed',
    buildLogLines: [],
    agentStatus: null,
    agentLogLines: [],
    ready: false,
    failed: true,
    reason,
    cursors: { build: null, agent: null },
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
            let finishEnsure!: (value: unknown) => void
            ensureMock.mockImplementation(
                () =>
                    new Promise((resolve) => {
                        finishEnsure = resolve
                    }),
            )

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId }), {
                wrapper: createTestQueryWrapper(),
            })

            act(() => result.current.launchWorkspace())

            await waitFor(() => expect(result.current.isLaunching).toBe(true))
            expect(result.current.isCreatingWorkspace).toBe(true)

            // Released rather than left parked: a mutation still pending at teardown can commit
            // past the test transaction's rollback.
            act(() => finishEnsure({ success: true, workspace: { id: 'workspace-456' } }))
            await waitFor(() => expect(result.current.isCreatingWorkspace).toBe(false))
        })

        it('should stay launching while the workspace is still provisioning', async () => {
            const { result } = renderHook(() => useWorkspaceLauncher({ studyId }), {
                wrapper: createTestQueryWrapper(),
            })

            act(() => result.current.launchWorkspace())

            await waitFor(() => expect(statusMock).toHaveBeenCalled())
            await waitFor(() => expect(result.current.isLaunching).toBe(true))
            expect(result.current.status?.reason).toBe('build status=running, no agent yet')
            expect(result.current.buildLog).toBe('pulling base image')
            expect(result.current.status?.agentStatus).toEqual({
                lifecycle: 'starting',
                status: 'connecting',
                codeServer: 'initializing',
            })
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

        // sameWindow keeps the IDE in the same Playwright page context for e2e testing.
        it('should open workspace in the same tab when launched with sameWindow', async () => {
            const url = 'https://workspace.example.com'
            statusMock.mockResolvedValue(readyStatus(url))

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId }), {
                wrapper: createTestQueryWrapper(),
            })

            act(() => {
                result.current.launchWorkspace({ sameWindow: true })
            })

            await waitFor(() => {
                expect(mockWindowOpen).toHaveBeenCalledWith(url, '_self')
                expect(result.current.isLaunching).toBe(false)
            })
        })

        // A blocked popup is not a launch failure: the workspace launched and the user gets a
        // clickable fallback notification.
        it('should show fallback notification without erroring when popup is blocked', async () => {
            mockWindowOpen.mockReturnValue(null)
            statusMock.mockResolvedValue(readyStatus())

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId }), {
                wrapper: createTestQueryWrapper(),
            })

            act(() => result.current.launchWorkspace())

            await waitFor(() =>
                expect(notifications.show).toHaveBeenCalledWith(
                    expect.objectContaining({
                        title: 'Popup blocked',
                        color: 'yellow',
                        autoClose: false,
                        withCloseButton: true,
                    }),
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
                    expect.objectContaining({ title: 'Popup blocked', color: 'yellow', autoClose: false }),
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
                expect(result.current.error?.message).toBe('terraform exploded')
                expect(result.current.isLaunching).toBe(false)
            })
        })

        // OTTER-832: the failure modal is the only surface, so each path captures without a toast.
        it.each([
            ['an ensure failure', 'boom', () => ensureMock.mockResolvedValue({ error: 'boom' })],
            [
                'a status polling error',
                'workspace not found',
                () => statusMock.mockResolvedValue({ error: 'workspace not found' }),
            ],
            ['a failed build', 'terraform exploded', () => statusMock.mockResolvedValue(failedStatus())],
        ])('reports %s to Sentry without a toast', async (_label, message, arrange) => {
            arrange()

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId }), {
                wrapper: createTestQueryWrapper(),
            })

            act(() => result.current.launchWorkspace())

            await waitFor(() => expect(result.current.errorEventId).toMatch(/^[a-f0-9]{32}$/))
            expect(result.current.error).not.toBeNull()
            expect(captureException).toHaveBeenCalledTimes(1)
            expect(captureException).toHaveBeenCalledWith(expect.objectContaining({ message }))
            expect(notifications.show).not.toHaveBeenCalled()
        })

        it('still offers a reload when a deploy left the launch action stale', async () => {
            ensureMock.mockRejectedValue(staleActionError())

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId }), {
                wrapper: createTestQueryWrapper(),
            })

            act(() => result.current.launchWorkspace())

            await waitFor(() =>
                expect(notifications.show).toHaveBeenCalledWith(
                    expect.objectContaining({ id: STALE_DEPLOYMENT_NOTIFICATION_ID }),
                ),
            )
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
