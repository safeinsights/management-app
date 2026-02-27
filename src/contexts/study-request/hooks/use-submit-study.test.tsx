import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { notifications } from '@mantine/notifications'
import { useSubmitStudy, type UseSubmitStudyOptions } from './use-submit-study'

vi.mock('@/server/actions/study-request', () => ({
    onSubmitDraftStudyAction: vi.fn(),
    submitStudyFromIDEAction: vi.fn(),
    finalizeStudySubmissionAction: vi.fn(),
    onDeleteStudyJobAction: vi.fn(),
}))

vi.mock('@/hooks/upload', () => ({
    uploadFiles: vi.fn(),
}))

import {
    onSubmitDraftStudyAction,
    submitStudyFromIDEAction,
    finalizeStudySubmissionAction,
} from '@/server/actions/study-request'
import { uploadFiles } from '@/hooks/upload'

const createWrapper = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    Wrapper.displayName = 'TestWrapper'
    return Wrapper
}

const defaultOptions: UseSubmitStudyOptions = {
    studyId: 'study-123',
    mainFileName: 'main.R',
    additionalFileNames: ['helper.R'],
    codeSource: 'upload',
    codeFiles: { mainFile: null, additionalFiles: [] },
}

describe('useSubmitStudy', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows error notification when studyId is missing', async () => {
        const { result } = renderHook(() => useSubmitStudy({ ...defaultOptions, studyId: null }), {
            wrapper: createWrapper(),
        })

        act(() => result.current.submitStudy())

        await waitFor(() => {
            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({
                    color: 'red',
                    title: 'Unable to Submit Study',
                }),
            )
        })
    })

    it('shows error notification when mainFileName is missing', async () => {
        const { result } = renderHook(() => useSubmitStudy({ ...defaultOptions, mainFileName: null }), {
            wrapper: createWrapper(),
        })

        act(() => result.current.submitStudy())

        await waitFor(() => {
            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({
                    color: 'red',
                    title: 'Unable to Submit Study',
                }),
            )
        })
    })

    it('calls submitStudyFromIDEAction with correct args for IDE source', async () => {
        ;(submitStudyFromIDEAction as Mock).mockResolvedValue({ studyId: 'study-123' })

        const { result } = renderHook(() => useSubmitStudy({ ...defaultOptions, codeSource: 'ide' }), {
            wrapper: createWrapper(),
        })

        act(() => result.current.submitStudy())

        await waitFor(() => {
            expect(submitStudyFromIDEAction).toHaveBeenCalledWith({
                studyId: 'study-123',
                mainFileName: 'main.R',
                fileNames: ['main.R', 'helper.R'],
            })
        })
    })

    it('calls onSubmitDraftStudyAction → uploadFiles → finalizeStudySubmissionAction for upload source', async () => {
        const mainFile = new File(['content'], 'main.R', { type: 'text/plain' })
        ;(onSubmitDraftStudyAction as Mock).mockResolvedValue({
            studyId: 'study-123',
            studyJobId: 'job-456',
            urlForCodeUpload: 'https://upload.example.com',
        })
        ;(uploadFiles as Mock).mockResolvedValue(undefined)
        ;(finalizeStudySubmissionAction as Mock).mockResolvedValue({ success: true })

        const { result } = renderHook(
            () =>
                useSubmitStudy({
                    ...defaultOptions,
                    codeSource: 'upload',
                    codeFiles: {
                        mainFile: { type: 'memory', file: mainFile },
                        additionalFiles: [],
                    },
                }),
            { wrapper: createWrapper() },
        )

        act(() => result.current.submitStudy())

        await waitFor(() => {
            expect(onSubmitDraftStudyAction).toHaveBeenCalledWith({
                studyId: 'study-123',
                mainCodeFileName: 'main.R',
                codeFileNames: ['helper.R'],
            })
            expect(uploadFiles).toHaveBeenCalledWith([[mainFile, 'https://upload.example.com']])
            expect(finalizeStudySubmissionAction).toHaveBeenCalledWith({ studyId: 'study-123' })
        })
    })

    it('shows success notification on completion', async () => {
        ;(submitStudyFromIDEAction as Mock).mockResolvedValue({ studyId: 'study-123' })

        const { result } = renderHook(() => useSubmitStudy({ ...defaultOptions, codeSource: 'ide' }), {
            wrapper: createWrapper(),
        })

        act(() => result.current.submitStudy())

        await waitFor(() => {
            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({
                    color: 'green',
                    title: 'Study Proposal Submitted',
                }),
            )
        })
    })

    it('shows error notification on failure', async () => {
        ;(submitStudyFromIDEAction as Mock).mockRejectedValue(new Error('Network error'))

        const { result } = renderHook(() => useSubmitStudy({ ...defaultOptions, codeSource: 'ide' }), {
            wrapper: createWrapper(),
        })

        act(() => result.current.submitStudy())

        await waitFor(() => {
            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({
                    color: 'red',
                    title: 'Unable to Submit Study',
                }),
            )
        })
    })

    it('calls onSettled callback regardless of outcome', async () => {
        ;(submitStudyFromIDEAction as Mock).mockResolvedValue({ studyId: 'study-123' })
        const onSettled = vi.fn()

        const { result } = renderHook(() => useSubmitStudy({ ...defaultOptions, codeSource: 'ide' }), {
            wrapper: createWrapper(),
        })

        act(() => result.current.submitStudy({ onSettled }))

        await waitFor(() => {
            expect(onSettled).toHaveBeenCalled()
        })
    })
})
