import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useResubmitIDEFiles } from './use-resubmit-ide-files'

vi.mock('@/server/actions/workspaces.actions', () => ({
    listWorkspaceFilesAction: vi.fn(),
}))

vi.mock('@mantine/notifications', () => ({
    notifications: { show: vi.fn() },
}))

import { listWorkspaceFilesAction } from '@/server/actions/workspaces.actions'

const createWrapper = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
}

describe('useResubmitIDEFiles', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns initial state with empty files', () => {
        const { result } = renderHook(() => useResubmitIDEFiles({ studyId: 'study-1' }), {
            wrapper: createWrapper(),
        })

        expect(result.current.hasImportedFromIDE).toBe(false)
        expect(result.current.filteredIdeFiles).toEqual([])
        expect(result.current.showEmptyState).toBe(true)
    })

    it('fetches files on handleImportFiles', async () => {
        ;(listWorkspaceFilesAction as Mock).mockResolvedValue({
            files: ['main.R', 'helper.R'],
            suggestedMain: 'main.R',
            lastModified: '2024-01-01',
        })

        const { result } = renderHook(() => useResubmitIDEFiles({ studyId: 'study-1' }), {
            wrapper: createWrapper(),
        })

        act(() => result.current.handleImportFiles())

        await waitFor(() => {
            expect(result.current.filteredIdeFiles).toEqual(['main.R', 'helper.R'])
            expect(result.current.currentIdeMainFile).toBe('main.R')
        })
    })

    it('removes file from filtered list', async () => {
        ;(listWorkspaceFilesAction as Mock).mockResolvedValue({
            files: ['main.R', 'helper.R', 'utils.R'],
            suggestedMain: 'main.R',
        })

        const { result } = renderHook(() => useResubmitIDEFiles({ studyId: 'study-1' }), {
            wrapper: createWrapper(),
        })

        act(() => result.current.handleImportFiles())
        await waitFor(() => expect(result.current.filteredIdeFiles.length).toBe(3))

        act(() => result.current.removeIdeFile('helper.R'))

        expect(result.current.filteredIdeFiles).toEqual(['main.R', 'utils.R'])
    })

    it('allows setting main file override', async () => {
        ;(listWorkspaceFilesAction as Mock).mockResolvedValue({
            files: ['main.R', 'helper.R'],
            suggestedMain: 'main.R',
        })

        const { result } = renderHook(() => useResubmitIDEFiles({ studyId: 'study-1' }), {
            wrapper: createWrapper(),
        })

        act(() => result.current.handleImportFiles())
        await waitFor(() => expect(result.current.currentIdeMainFile).toBe('main.R'))

        act(() => result.current.setIdeMainFile('helper.R'))

        expect(result.current.currentIdeMainFile).toBe('helper.R')
    })

    it('computes canSubmitFromIDE correctly', async () => {
        ;(listWorkspaceFilesAction as Mock).mockResolvedValue({
            files: ['main.R'],
            suggestedMain: 'main.R',
        })

        const { result } = renderHook(() => useResubmitIDEFiles({ studyId: 'study-1' }), {
            wrapper: createWrapper(),
        })

        expect(result.current.canSubmitFromIDE).toBe(false)

        act(() => result.current.handleImportFiles())
        await waitFor(() => expect(result.current.canSubmitFromIDE).toBe(true))
    })
})
