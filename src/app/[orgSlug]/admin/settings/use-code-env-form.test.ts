import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
// eslint-disable-next-line no-restricted-imports
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useParams } from 'next/navigation'
import { useCodeEnvForm } from './use-code-env-form'

vi.mock('./code-envs.actions', () => ({
    createOrgCodeEnvAction: vi.fn(),
    updateOrgCodeEnvAction: vi.fn(),
    getStarterCodeUploadUrlAction: vi.fn(),
    getSampleDataUploadUrlAction: vi.fn(),
}))

vi.mock('@/hooks/upload', () => ({
    uploadFiles: vi.fn().mockResolvedValue([]),
}))

import {
    createOrgCodeEnvAction,
    updateOrgCodeEnvAction,
    getStarterCodeUploadUrlAction,
    getSampleDataUploadUrlAction,
} from './code-envs.actions'
import { uploadFiles } from '@/hooks/upload'

const TEST_ORG_SLUG = 'test-org'

const mockPresignedUrl = { url: 'https://s3.example.com', fields: { key: 'test' } }

const mockCodeEnv = {
    id: 'code-env-1',
    orgId: 'org-1',
    name: 'Test Env',
    language: 'PYTHON' as const,
    cmdLine: 'python %f',
    url: 'python:3.11',
    isTesting: false,
    starterCodePath: 'code-env/test-org/code-env-1/starter-code/main.py',
    sampleDataPath: null,
    sampleDataFormat: null,
    settings: { environment: [] },
    createdAt: new Date(),
}

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

describe('useCodeEnvForm', () => {
    beforeEach(() => {
        ;(useParams as Mock).mockReturnValue({ orgSlug: TEST_ORG_SLUG })
        ;(getStarterCodeUploadUrlAction as Mock).mockResolvedValue(mockPresignedUrl)
        ;(getSampleDataUploadUrlAction as Mock).mockResolvedValue(mockPresignedUrl)
    })

    it('returns create mode when no image is provided', () => {
        const { result } = renderHook(() => useCodeEnvForm(undefined, vi.fn()), {
            wrapper: createWrapper(),
        })

        expect(result.current.isEditMode).toBe(false)
    })

    it('returns edit mode when image is provided', () => {
        const { result } = renderHook(() => useCodeEnvForm(mockCodeEnv, vi.fn()), {
            wrapper: createWrapper(),
        })

        expect(result.current.isEditMode).toBe(true)
    })

    it('create: uploads starter code via presigned URL', async () => {
        const createdEnv = { ...mockCodeEnv, id: 'new-id' }
        ;(createOrgCodeEnvAction as Mock).mockResolvedValue(createdEnv)

        const onComplete = vi.fn()
        const { result } = renderHook(() => useCodeEnvForm(undefined, onComplete), {
            wrapper: createWrapper(),
        })

        const starterCode = new File(['code'], 'main.py')
        act(() => {
            result.current.form.setFieldValue('name', 'New Env')
            result.current.form.setFieldValue('cmdLine', 'python %f')
            result.current.form.setFieldValue('url', 'python:3.11')
            result.current.form.setFieldValue('starterCode', starterCode)
        })

        act(() => result.current.onSubmit())

        await waitFor(() => {
            expect(createOrgCodeEnvAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    orgSlug: TEST_ORG_SLUG,
                    starterCodeFileName: 'main.py',
                }),
            )
            expect(getStarterCodeUploadUrlAction).toHaveBeenCalledWith({
                orgSlug: TEST_ORG_SLUG,
                codeEnvId: 'new-id',
            })
            expect(uploadFiles).toHaveBeenCalledWith([[starterCode, mockPresignedUrl]])
        })
    })

    it('create: uploads sample data when sampleDataPath is set', async () => {
        const createdEnv = { ...mockCodeEnv, id: 'new-id' }
        ;(createOrgCodeEnvAction as Mock).mockResolvedValue(createdEnv)

        const onComplete = vi.fn()
        const { result } = renderHook(() => useCodeEnvForm(undefined, onComplete), {
            wrapper: createWrapper(),
        })

        const starterCode = new File(['code'], 'main.py')
        const sampleFile = new File(['data'], 'sample.csv')

        act(() => {
            result.current.form.setFieldValue('name', 'New Env')
            result.current.form.setFieldValue('cmdLine', 'python %f')
            result.current.form.setFieldValue('url', 'python:3.11')
            result.current.form.setFieldValue('starterCode', starterCode)
            result.current.form.setFieldValue('sampleDataPath', 'data/sample.csv')
            result.current.setSampleDataFiles([sampleFile])
        })

        act(() => result.current.onSubmit())

        await waitFor(() => {
            expect(getSampleDataUploadUrlAction).toHaveBeenCalledWith({ codeEnvId: 'new-id' })
            expect(uploadFiles).toHaveBeenCalledWith([[sampleFile, mockPresignedUrl]])
        })
    })

    it('create: does not upload sample data when sampleDataPath is empty', async () => {
        const createdEnv = { ...mockCodeEnv, id: 'new-id' }
        ;(createOrgCodeEnvAction as Mock).mockResolvedValue(createdEnv)

        const { result } = renderHook(() => useCodeEnvForm(undefined, vi.fn()), {
            wrapper: createWrapper(),
        })

        const starterCode = new File(['code'], 'main.py')
        act(() => {
            result.current.form.setFieldValue('name', 'New Env')
            result.current.form.setFieldValue('cmdLine', 'python %f')
            result.current.form.setFieldValue('url', 'python:3.11')
            result.current.form.setFieldValue('starterCode', starterCode)
        })

        act(() => result.current.onSubmit())

        await waitFor(() => {
            expect(createOrgCodeEnvAction).toHaveBeenCalled()
            expect(getSampleDataUploadUrlAction).not.toHaveBeenCalled()
        })
    })

    it('edit: uploads new starter code and calls update action', async () => {
        const updatedEnv = { ...mockCodeEnv, name: 'Updated' }
        ;(updateOrgCodeEnvAction as Mock).mockResolvedValue(updatedEnv)

        const onComplete = vi.fn()
        const { result } = renderHook(() => useCodeEnvForm(mockCodeEnv, onComplete), {
            wrapper: createWrapper(),
        })

        const newStarterCode = new File(['new code'], 'updated.py')
        act(() => {
            result.current.form.setFieldValue('starterCode', newStarterCode)
        })

        act(() => result.current.onSubmit())

        await waitFor(() => {
            expect(getStarterCodeUploadUrlAction).toHaveBeenCalledWith({
                orgSlug: TEST_ORG_SLUG,
                codeEnvId: mockCodeEnv.id,
            })
            expect(updateOrgCodeEnvAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    orgSlug: TEST_ORG_SLUG,
                    imageId: mockCodeEnv.id,
                    starterCodeFileName: 'updated.py',
                    starterCodeUploaded: true,
                }),
            )
        })
    })

    it('edit: skips starter code upload when no new file', async () => {
        const updatedEnv = { ...mockCodeEnv, name: 'Updated' }
        ;(updateOrgCodeEnvAction as Mock).mockResolvedValue(updatedEnv)

        const { result } = renderHook(() => useCodeEnvForm(mockCodeEnv, vi.fn()), {
            wrapper: createWrapper(),
        })

        act(() => result.current.onSubmit())

        await waitFor(() => {
            expect(getStarterCodeUploadUrlAction).not.toHaveBeenCalled()
            expect(updateOrgCodeEnvAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    starterCodeUploaded: false,
                    starterCodeFileName: undefined,
                }),
            )
        })
    })

    it('edit: uploads sample data files', async () => {
        ;(updateOrgCodeEnvAction as Mock).mockResolvedValue(mockCodeEnv)

        const { result } = renderHook(() => useCodeEnvForm(mockCodeEnv, vi.fn()), {
            wrapper: createWrapper(),
        })

        const sampleFile = new File(['data'], 'data.csv')
        act(() => {
            result.current.setSampleDataFiles([sampleFile])
        })

        act(() => result.current.onSubmit())

        await waitFor(() => {
            expect(getSampleDataUploadUrlAction).toHaveBeenCalledWith({ codeEnvId: mockCodeEnv.id })
            expect(updateOrgCodeEnvAction).toHaveBeenCalledWith(expect.objectContaining({ sampleDataUploaded: true }))
        })
    })
})
