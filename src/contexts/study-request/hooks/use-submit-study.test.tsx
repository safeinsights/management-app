import { vi } from 'vitest'
import {
    describe,
    it,
    expect,
    waitFor,
    act,
    renderHook,
    faker,
    createTestQueryClient,
    QueryClientProvider,
    type Mock,
} from '@/tests/unit.helpers'
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
    const client = createTestQueryClient()
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    Wrapper.displayName = 'TestWrapper'
    return Wrapper
}

const studyId = faker.string.uuid()

const defaultOptions: UseSubmitStudyOptions = {
    studyId,
    mainFileName: 'main.R',
    additionalFileNames: ['helper.R'],
    codeSource: 'upload',
    codeFiles: { mainFile: null, additionalFiles: [] },
}

describe('useSubmitStudy', () => {
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
                    message: 'Study ID is required to submit',
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
        ;(submitStudyFromIDEAction as Mock).mockResolvedValue({ studyId })

        const { result } = renderHook(() => useSubmitStudy({ ...defaultOptions, codeSource: 'ide' }), {
            wrapper: createWrapper(),
        })

        act(() => result.current.submitStudy())

        await waitFor(() => {
            expect(submitStudyFromIDEAction).toHaveBeenCalledWith({
                studyId,
                mainFileName: 'main.R',
                fileNames: ['main.R', 'helper.R'],
            })
        })
    })

    it('calls onSubmitDraftStudyAction → uploadFiles → finalizeStudySubmissionAction for upload source', async () => {
        const mainFile = new File(['content'], 'main.R', { type: 'text/plain' })
        const studyJobId = faker.string.uuid()
        ;(onSubmitDraftStudyAction as Mock).mockResolvedValue({
            studyId,
            studyJobId,
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
                studyId,
                mainCodeFileName: 'main.R',
                codeFileNames: ['helper.R'],
            })
            expect(uploadFiles).toHaveBeenCalledWith([[mainFile, 'https://upload.example.com']])
            expect(finalizeStudySubmissionAction).toHaveBeenCalledWith({ studyId })
        })
    })

    it('submits existing server files through upload flow without re-uploading', async () => {
        const studyJobId = faker.string.uuid()
        ;(onSubmitDraftStudyAction as Mock).mockResolvedValue({
            studyId,
            studyJobId,
            urlForCodeUpload: 'https://upload.example.com',
        })
        ;(finalizeStudySubmissionAction as Mock).mockResolvedValue({ success: true })

        const { result } = renderHook(
            () =>
                useSubmitStudy({
                    ...defaultOptions,
                    codeSource: 'upload',
                    codeFiles: {
                        mainFile: { type: 'server', name: 'main.R', path: 'study/main.R' },
                        additionalFiles: [{ type: 'server', name: 'helper.R', path: 'study/helper.R' }],
                    },
                }),
            { wrapper: createWrapper() },
        )

        act(() => result.current.submitStudy())

        await waitFor(() => {
            expect(onSubmitDraftStudyAction).toHaveBeenCalledWith({
                studyId,
                mainCodeFileName: 'main.R',
                codeFileNames: ['helper.R'],
            })
            expect(uploadFiles).not.toHaveBeenCalled()
            expect(submitStudyFromIDEAction).not.toHaveBeenCalled()
            expect(finalizeStudySubmissionAction).toHaveBeenCalledWith({ studyId })
        })
    })

    it('shows success notification on completion', async () => {
        ;(submitStudyFromIDEAction as Mock).mockResolvedValue({ studyId })

        const { result } = renderHook(() => useSubmitStudy({ ...defaultOptions, codeSource: 'ide' }), {
            wrapper: createWrapper(),
        })

        act(() => result.current.submitStudy())

        await waitFor(() => {
            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({
                    color: 'green',
                    title: 'Study Code Submitted',
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
        ;(submitStudyFromIDEAction as Mock).mockResolvedValue({ studyId })
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
