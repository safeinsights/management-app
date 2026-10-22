import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useParams } from 'next/navigation'
import { createTestQueryWrapper, testImageRef } from '@/tests/unit.helpers'

const TEST_DIGEST = `sha256:${'a'.repeat(64)}`
import { useCodeEnvForm } from './use-code-env-form'

vi.mock('@/server/actions/code-envs.actions', () => ({
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
} from '@/server/actions/code-envs.actions'
import { uploadFiles } from '@/hooks/upload'

const TEST_ORG_SLUG = 'test-org'

const mockPresignedUrl = { url: 'https://s3.example.com', fields: { key: 'test' } }

const mockCodeEnv = {
    id: 'code-env-1',
    orgId: 'org-1',
    identifier: 'test_env',
    name: 'Test Env',
    language: 'PYTHON' as const,
    commandLines: { py: 'python %f' },
    url: testImageRef('python:3.11'),
    isTesting: false,
    starterCodeFileNames: ['main.py'],
    sampleDataPath: null,
    dataSourceType: null,
    settings: { environment: [] },
    createdAt: new Date(),
    latestScanStatus: null,
    latestScanResults: null,
    dataSources: [] as { id: string; name: string }[],
}

describe('useCodeEnvForm', () => {
    beforeEach(() => {
        ;(useParams as Mock).mockReturnValue({ orgSlug: TEST_ORG_SLUG })
        ;(getStarterCodeUploadUrlAction as Mock).mockResolvedValue(mockPresignedUrl)
        ;(getSampleDataUploadUrlAction as Mock).mockResolvedValue(mockPresignedUrl)
    })

    // OTTER-647: a half-filled draft pair was discarded on submit, so the save appeared to
    // succeed while losing the input.
    describe('draft env var and command pairs', () => {
        const seedRequiredFields = (result: { current: ReturnType<typeof useCodeEnvForm> }) => {
            act(() => {
                result.current.form.setFieldValue('identifier', 'new_env')
                result.current.form.setFieldValue('name', 'New Env')
                result.current.form.setFieldValue('commandLines', { py: 'python %f' })
                result.current.form.setFieldValue('url', 'python:3.11')
                result.current.form.setFieldValue('digest', TEST_DIGEST)
                result.current.form.setFieldValue('starterCodes', [new File(['code'], 'main.py')])
            })
        }

        it('blocks submit and flags the empty half of a draft env var', async () => {
            const { result } = renderHook(() => useCodeEnvForm(undefined, vi.fn()), {
                wrapper: createTestQueryWrapper(),
            })
            seedRequiredFields(result)
            act(() => result.current.form.setFieldValue('newEnvKey', 'FOO'))

            act(() => result.current.onSubmit())

            await waitFor(() => {
                expect(result.current.form.errors.newEnvValue).toBe('Complete both fields or clear them')
            })
            expect(createOrgCodeEnvAction).not.toHaveBeenCalled()
        })

        it('treats a whitespace-only half as empty rather than saving the whitespace', async () => {
            const { result } = renderHook(() => useCodeEnvForm(undefined, vi.fn()), {
                wrapper: createTestQueryWrapper(),
            })
            seedRequiredFields(result)
            act(() => {
                result.current.form.setFieldValue('newEnvKey', 'FOO')
                result.current.form.setFieldValue('newEnvValue', '   ')
            })

            act(() => result.current.onSubmit())

            await waitFor(() => {
                expect(result.current.form.errors.newEnvValue).toBe('Complete both fields or clear them')
            })
            expect(createOrgCodeEnvAction).not.toHaveBeenCalled()
        })

        it('appends a complete draft pair, trimmed', async () => {
            ;(createOrgCodeEnvAction as Mock).mockResolvedValue({ ...mockCodeEnv, id: 'new-id' })
            const { result } = renderHook(() => useCodeEnvForm(undefined, vi.fn()), {
                wrapper: createTestQueryWrapper(),
            })
            seedRequiredFields(result)
            act(() => {
                result.current.form.setFieldValue('newEnvKey', '  FOO  ')
                result.current.form.setFieldValue('newEnvValue', '  bar  ')
            })

            act(() => result.current.onSubmit())

            await waitFor(() => {
                expect(createOrgCodeEnvAction).toHaveBeenCalledWith(
                    expect.objectContaining({
                        settings: expect.objectContaining({ environment: [{ name: 'FOO', value: 'bar' }] }),
                    }),
                )
            })
        })

        it('flags the empty half of a draft command line', async () => {
            const { result } = renderHook(() => useCodeEnvForm(undefined, vi.fn()), {
                wrapper: createTestQueryWrapper(),
            })
            seedRequiredFields(result)
            act(() => result.current.form.setFieldValue('newCmdValue', 'python %f'))

            act(() => result.current.onSubmit())

            await waitFor(() => {
                expect(result.current.form.errors.newCmdExt).toBe('Complete both fields or clear them')
            })
            expect(createOrgCodeEnvAction).not.toHaveBeenCalled()
        })
    })

    it('returns create mode when no image is provided', () => {
        const { result } = renderHook(() => useCodeEnvForm(undefined, vi.fn()), {
            wrapper: createTestQueryWrapper(),
        })

        expect(result.current.isEditMode).toBe(false)
    })

    it('returns edit mode when image is provided', () => {
        const { result } = renderHook(() => useCodeEnvForm(mockCodeEnv, vi.fn()), {
            wrapper: createTestQueryWrapper(),
        })

        expect(result.current.isEditMode).toBe(true)
    })

    it('create: uploads starter code via presigned URL', async () => {
        const createdEnv = { ...mockCodeEnv, id: 'new-id' }
        ;(createOrgCodeEnvAction as Mock).mockResolvedValue(createdEnv)

        const onComplete = vi.fn()
        const { result } = renderHook(() => useCodeEnvForm(undefined, onComplete), {
            wrapper: createTestQueryWrapper(),
        })

        const starterCode = new File(['code'], 'main.py')
        act(() => {
            result.current.form.setFieldValue('identifier', 'new_env')
            result.current.form.setFieldValue('name', 'New Env')
            result.current.form.setFieldValue('commandLines', { py: 'python %f' })
            result.current.form.setFieldValue('url', 'python:3.11')
            result.current.form.setFieldValue('digest', TEST_DIGEST)
            result.current.form.setFieldValue('starterCodes', [starterCode])
        })

        act(() => result.current.onSubmit())

        await waitFor(() => {
            expect(createOrgCodeEnvAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    orgSlug: TEST_ORG_SLUG,
                    url: testImageRef('python:3.11'),
                    starterCodeFileNames: ['main.py'],
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
            wrapper: createTestQueryWrapper(),
        })

        const starterCode = new File(['code'], 'main.py')
        const sampleFile = new File(['data'], 'sample.csv')

        act(() => {
            result.current.form.setFieldValue('identifier', 'new_env')
            result.current.form.setFieldValue('name', 'New Env')
            result.current.form.setFieldValue('commandLines', { py: 'python %f' })
            result.current.form.setFieldValue('url', 'python:3.11')
            result.current.form.setFieldValue('digest', TEST_DIGEST)
            result.current.form.setFieldValue('starterCodes', [starterCode])
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
            wrapper: createTestQueryWrapper(),
        })

        const starterCode = new File(['code'], 'main.py')
        act(() => {
            result.current.form.setFieldValue('identifier', 'new_env')
            result.current.form.setFieldValue('name', 'New Env')
            result.current.form.setFieldValue('commandLines', { py: 'python %f' })
            result.current.form.setFieldValue('url', 'python:3.11')
            result.current.form.setFieldValue('digest', TEST_DIGEST)
            result.current.form.setFieldValue('starterCodes', [starterCode])
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
            wrapper: createTestQueryWrapper(),
        })

        const newStarterCode = new File(['new code'], 'updated.py')
        act(() => {
            result.current.form.setFieldValue('starterCodes', [newStarterCode])
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
                    codeEnvId: mockCodeEnv.id,
                    starterCodeFileNames: ['updated.py'],
                    starterCodeUploaded: true,
                }),
            )
        })
    })

    it('edit: splits a pinned URL into the URL and digest fields', () => {
        const { result } = renderHook(() => useCodeEnvForm(mockCodeEnv, vi.fn()), {
            wrapper: createTestQueryWrapper(),
        })

        expect(result.current.form.values.url).toBe('python:3.11')
        expect(result.current.form.values.digest).toBe(TEST_DIGEST)
        expect(result.current.form.errors.digest).toBeUndefined()
    })

    it('edit: flags a legacy unpinned URL on open and blocks submit until a digest is added', async () => {
        ;(updateOrgCodeEnvAction as Mock).mockResolvedValue(mockCodeEnv)
        const legacyEnv = { ...mockCodeEnv, url: 'python:3.11' }

        const { result } = renderHook(() => useCodeEnvForm(legacyEnv, vi.fn()), {
            wrapper: createTestQueryWrapper(),
        })

        expect(result.current.form.errors.digest).toBe('Image digest is required')

        act(() => result.current.onSubmit())
        await waitFor(() => expect(result.current.form.errors.digest).toBe('Image digest is required'))
        expect(updateOrgCodeEnvAction).not.toHaveBeenCalled()

        act(() => result.current.form.setFieldValue('digest', 'a'.repeat(64)))
        act(() => result.current.onSubmit())
        await waitFor(() =>
            expect(updateOrgCodeEnvAction).toHaveBeenCalledWith(
                expect.objectContaining({ url: testImageRef('python:3.11') }),
            ),
        )
    })

    it('create: flags a truncated digest', async () => {
        const { result } = renderHook(() => useCodeEnvForm(undefined, vi.fn()), {
            wrapper: createTestQueryWrapper(),
        })
        act(() => result.current.form.setFieldValue('digest', 'sha256:771722e4'))

        act(() => result.current.onSubmit())

        await waitFor(() => expect(result.current.form.errors.digest).toMatch(/truncated/))
        expect(createOrgCodeEnvAction).not.toHaveBeenCalled()
    })

    it.each([testImageRef('python:3.11'), `python/${TEST_DIGEST}`])(
        'create: points a digest pasted into the URL field (%s) at the digest field',
        async (url) => {
            const { result } = renderHook(() => useCodeEnvForm(undefined, vi.fn()), {
                wrapper: createTestQueryWrapper(),
            })
            act(() => result.current.form.setFieldValue('url', url))

            act(() => result.current.onSubmit())

            await waitFor(() =>
                expect(result.current.form.errors.url).toBe('Put the digest in the Image digest field, not the URL'),
            )
        },
    )

    it('edit: skips starter code upload when no new file', async () => {
        const updatedEnv = { ...mockCodeEnv, name: 'Updated' }
        ;(updateOrgCodeEnvAction as Mock).mockResolvedValue(updatedEnv)

        const { result } = renderHook(() => useCodeEnvForm(mockCodeEnv, vi.fn()), {
            wrapper: createTestQueryWrapper(),
        })

        act(() => result.current.onSubmit())

        await waitFor(() => {
            expect(getStarterCodeUploadUrlAction).not.toHaveBeenCalled()
            expect(updateOrgCodeEnvAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    starterCodeUploaded: false,
                    starterCodeFileNames: undefined,
                }),
            )
        })
    })

    it('edit: uploads sample data files', async () => {
        ;(updateOrgCodeEnvAction as Mock).mockResolvedValue(mockCodeEnv)

        const { result } = renderHook(() => useCodeEnvForm(mockCodeEnv, vi.fn()), {
            wrapper: createTestQueryWrapper(),
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
