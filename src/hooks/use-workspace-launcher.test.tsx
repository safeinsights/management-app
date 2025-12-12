import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useWorkspaceLauncher } from './use-workspace-launcher'

// Mock the server actions
vi.mock('@/server/actions/coder.actions', () => ({
    createUserAndWorkspaceAction: vi.fn(),
    getWorkspaceUrlAction: vi.fn(),
}))

// Mock mantine notifications
vi.mock('@mantine/notifications', () => ({
    notifications: {
        show: vi.fn(),
    },
}))

// Mock window.open
const mockWindowOpen = vi.fn()
Object.defineProperty(window, 'open', {
    value: mockWindowOpen,
    writable: true,
})

import { createUserAndWorkspaceAction, getWorkspaceUrlAction } from '@/server/actions/coder.actions'
import { notifications } from '@mantine/notifications'

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    })
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children)
    Wrapper.displayName = 'QueryClientWrapper'
    return Wrapper
}

describe('useWorkspaceLauncher', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockWindowOpen.mockReturnValue({ closed: false })
    })

    describe('initial state', () => {
        it('should return initial state correctly', () => {
            const { result } = renderHook(() => useWorkspaceLauncher({ studyId: 'study-123' }), {
                wrapper: createWrapper(),
            })

            expect(result.current.isLaunching).toBe(false)
            expect(result.current.isCreatingWorkspace).toBe(false)
            expect(result.current.error).toBeNull()
            expect(typeof result.current.launchWorkspace).toBe('function')
            expect(typeof result.current.clearError).toBe('function')
        })
    })

    describe('launchWorkspace', () => {
        it('should set isLaunching to true when launching', async () => {
            ;(createUserAndWorkspaceAction as Mock).mockImplementation(
                () => new Promise(() => {}), // Never resolves
            )

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId: 'study-123' }), {
                wrapper: createWrapper(),
            })

            act(() => {
                result.current.launchWorkspace()
            })

            await waitFor(() => {
                expect(result.current.isLaunching).toBe(true)
            })
        })

        it('should handle mutation error', async () => {
            const errorMessage = 'Failed to create workspace'
            ;(createUserAndWorkspaceAction as Mock).mockResolvedValue({ error: errorMessage })

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId: 'study-123' }), {
                wrapper: createWrapper(),
            })

            act(() => {
                result.current.launchWorkspace()
            })

            await waitFor(() => {
                expect(result.current.error).not.toBeNull()
                expect(result.current.error?.message).toBe(errorMessage)
                expect(result.current.isLaunching).toBe(false)
            })
        })

        it('should handle mutation error with non-string error', async () => {
            ;(createUserAndWorkspaceAction as Mock).mockResolvedValue({ error: { code: 500 } })

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId: 'study-123' }), {
                wrapper: createWrapper(),
            })

            act(() => {
                result.current.launchWorkspace()
            })

            await waitFor(() => {
                expect(result.current.error).not.toBeNull()
                expect(result.current.error?.message).toBe('Failed to launch IDE')
            })
        })

        it('should poll for workspace URL after successful mutation', async () => {
            const workspaceId = 'workspace-456'
            ;(createUserAndWorkspaceAction as Mock).mockResolvedValue({
                workspace: { id: workspaceId },
            })
            ;(getWorkspaceUrlAction as Mock).mockResolvedValue('https://workspace.example.com')

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId: 'study-123' }), {
                wrapper: createWrapper(),
            })

            act(() => {
                result.current.launchWorkspace()
            })

            await waitFor(() => {
                expect(getWorkspaceUrlAction).toHaveBeenCalledWith({
                    studyId: 'study-123',
                    workspaceId: workspaceId,
                })
            })
        })

        it('should open workspace in new tab when URL is available', async () => {
            const workspaceUrl = 'https://workspace.example.com'
            ;(createUserAndWorkspaceAction as Mock).mockResolvedValue({
                workspace: { id: 'workspace-456' },
            })
            ;(getWorkspaceUrlAction as Mock).mockResolvedValue(workspaceUrl)

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId: 'study-123' }), {
                wrapper: createWrapper(),
            })

            act(() => {
                result.current.launchWorkspace()
            })

            await waitFor(() => {
                expect(mockWindowOpen).toHaveBeenCalledWith(workspaceUrl, 'child')
                expect(result.current.isLaunching).toBe(false)
            })
        })

        it('should show notification and set error when popup is blocked', async () => {
            const workspaceUrl = 'https://workspace.example.com'
            mockWindowOpen.mockReturnValue(null) // Simulate blocked popup
            ;(createUserAndWorkspaceAction as Mock).mockResolvedValue({
                workspace: { id: 'workspace-456' },
            })
            ;(getWorkspaceUrlAction as Mock).mockResolvedValue(workspaceUrl)

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId: 'study-123' }), {
                wrapper: createWrapper(),
            })

            act(() => {
                result.current.launchWorkspace()
            })

            await waitFor(() => {
                expect(result.current.error?.message).toBe('Popup blocked')
                expect(notifications.show).toHaveBeenCalledWith(
                    expect.objectContaining({
                        title: 'Popup blocked',
                        color: 'yellow',
                        autoClose: false,
                    }),
                )
            })
        })

        it('should detect popup blocked when window.closed is true', async () => {
            mockWindowOpen.mockReturnValue({ closed: true })
            ;(createUserAndWorkspaceAction as Mock).mockResolvedValue({
                workspace: { id: 'workspace-456' },
            })
            ;(getWorkspaceUrlAction as Mock).mockResolvedValue('https://workspace.example.com')

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId: 'study-123' }), {
                wrapper: createWrapper(),
            })

            act(() => {
                result.current.launchWorkspace()
            })

            await waitFor(() => {
                expect(result.current.error?.message).toBe('Popup blocked')
            })
        })
    })

    describe('query error handling', () => {
        it('should handle query error', async () => {
            const queryError = 'Workspace not found'
            ;(createUserAndWorkspaceAction as Mock).mockResolvedValue({
                workspace: { id: 'workspace-456' },
            })
            ;(getWorkspaceUrlAction as Mock).mockResolvedValue({ error: queryError })

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId: 'study-123' }), {
                wrapper: createWrapper(),
            })

            act(() => {
                result.current.launchWorkspace()
            })

            await waitFor(() => {
                expect(result.current.error).not.toBeNull()
                expect(result.current.isLaunching).toBe(false)
            })
        })

        it('should handle query error with non-string error', async () => {
            ;(createUserAndWorkspaceAction as Mock).mockResolvedValue({
                workspace: { id: 'workspace-456' },
            })
            ;(getWorkspaceUrlAction as Mock).mockResolvedValue({ error: { code: 404 } })

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId: 'study-123' }), {
                wrapper: createWrapper(),
            })

            act(() => {
                result.current.launchWorkspace()
            })

            await waitFor(() => {
                expect(result.current.error).not.toBeNull()
            })
        })
    })

    describe('clearError', () => {
        it('should clear local error state', async () => {
            ;(createUserAndWorkspaceAction as Mock).mockResolvedValue({ error: 'Some error' })

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId: 'study-123' }), {
                wrapper: createWrapper(),
            })

            act(() => {
                result.current.launchWorkspace()
            })

            await waitFor(() => {
                expect(result.current.error).not.toBeNull()
            })

            act(() => {
                result.current.clearError()
            })

            // Note: clearError only clears local error state, not query errors
            // This test verifies the function works for local errors
            await waitFor(() => {
                // After clearing, error should still be null (was mutation error)
                expect(result.current.error).toBeNull()
            })
        })
    })

    describe('retry behavior', () => {
        it('should allow retrying after mutation error', async () => {
            ;(createUserAndWorkspaceAction as Mock)
                .mockResolvedValueOnce({ error: 'First attempt failed' })
                .mockResolvedValueOnce({
                    workspace: { id: 'workspace-789' },
                })
            ;(getWorkspaceUrlAction as Mock).mockResolvedValue('https://workspace.example.com')

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId: 'study-123' }), {
                wrapper: createWrapper(),
            })

            // First attempt - fails
            act(() => {
                result.current.launchWorkspace()
            })

            await waitFor(() => {
                expect(result.current.error).not.toBeNull()
            })

            // Second attempt - succeeds
            act(() => {
                result.current.launchWorkspace()
            })

            await waitFor(() => {
                expect(mockWindowOpen).toHaveBeenCalled()
                expect(result.current.error).toBeNull()
            })
        })

        it('should reset error state when retrying', async () => {
            ;(createUserAndWorkspaceAction as Mock).mockResolvedValue({ error: 'Some error' })

            const { result } = renderHook(() => useWorkspaceLauncher({ studyId: 'study-123' }), {
                wrapper: createWrapper(),
            })

            act(() => {
                result.current.launchWorkspace()
            })

            await waitFor(() => {
                expect(result.current.error).not.toBeNull()
            })

            // Clear mocks to track new calls
            vi.clearAllMocks()
            ;(createUserAndWorkspaceAction as Mock).mockImplementation(() => new Promise(() => {}))

            act(() => {
                result.current.launchWorkspace()
            })

            // Error should be cleared immediately when retrying
            await waitFor(() => {
                expect(result.current.error).toBeNull()
                expect(result.current.isLaunching).toBe(true)
            })
        })
    })
})
