import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useParams } from 'next/navigation'
import {
    actionResult,
    createTestQueryWrapper,
    db,
    insertTestCodeEnv,
    mockSessionWithTestData,
    testImageRef,
    waitForPendingMutations,
} from '@/tests/unit.helpers'
import { pathForSampleData, pathForStarterCode } from '@/lib/paths'
import { fetchOrgCodeEnvsAction } from '@/server/actions/code-envs.actions'
import { storeS3File } from '@/server/aws'
import { fetchFileContents } from '@/server/storage'
import { useCodeEnvForm } from './use-code-env-form'

const TEST_DIGEST = `sha256:${'a'.repeat(64)}`

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
    let org: { id: string; slug: string }

    beforeEach(async () => {
        ;({ org } = await mockSessionWithTestData({ isAdmin: true }))
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug })
    })

    const codeEnvsInOrg = () =>
        db.selectFrom('orgCodeEnv').selectAll('orgCodeEnv').where('orgId', '=', org.id).execute()

    // Uploads go through the presigned post to the local S3, so what they wrote is read back from it.
    const storedText = async (path: string) => (await fetchFileContents(path)).text()

    // A saved environment, read back the way the settings page loads it.
    const insertCodeEnv = async ({ url = testImageRef('python:3.11') }: { url?: string } = {}) => {
        const { id } = await insertTestCodeEnv({
            orgId: org.id,
            identifier: 'test_env',
            name: 'Test Env',
            language: 'PYTHON',
            url,
            starterCodeFileNames: ['main.py'],
        })
        return actionResult(await fetchOrgCodeEnvsAction({ orgSlug: org.slug })).find((env) => env.id === id)!
    }

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
            await waitForPendingMutations()
            expect(await codeEnvsInOrg()).toEqual([])
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
            await waitForPendingMutations()
            expect(await codeEnvsInOrg()).toEqual([])
        })

        it('appends a complete draft pair, trimmed', async () => {
            const { result } = renderHook(() => useCodeEnvForm(undefined, vi.fn()), {
                wrapper: createTestQueryWrapper(),
            })
            seedRequiredFields(result)
            act(() => {
                result.current.form.setFieldValue('newEnvKey', '  FOO  ')
                result.current.form.setFieldValue('newEnvValue', '  bar  ')
            })

            act(() => result.current.onSubmit())

            await waitForPendingMutations()
            const [created] = await codeEnvsInOrg()
            expect(created.settings).toEqual(expect.objectContaining({ environment: [{ name: 'FOO', value: 'bar' }] }))
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
            await waitForPendingMutations()
            expect(await codeEnvsInOrg()).toEqual([])
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

        await waitForPendingMutations()
        const [created] = await codeEnvsInOrg()
        expect(created).toMatchObject({ url: testImageRef('python:3.11'), starterCodeFileNames: ['main.py'] })
        const starterPath = pathForStarterCode({ orgSlug: org.slug, codeEnvId: created.id, fileName: 'main.py' })
        expect(await storedText(starterPath)).toBe('code')
    })

    it('create: uploads sample data when sampleDataPath is set', async () => {
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

        await waitForPendingMutations()
        const [created] = await codeEnvsInOrg()
        const samplePrefix = pathForSampleData({
            orgSlug: org.slug,
            codeEnvId: created.id,
            sampleDataPath: created.sampleDataPath,
        })
        expect(await storedText(`${samplePrefix}/sample.csv`)).toBe('data')
    })

    it('create: does not upload sample data when sampleDataPath is empty', async () => {
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
            result.current.setSampleDataFiles([new File(['data'], 'sample.csv')])
        })

        act(() => result.current.onSubmit())

        await waitForPendingMutations()
        const [created] = await codeEnvsInOrg()
        const samplePrefix = pathForSampleData({ orgSlug: org.slug, codeEnvId: created.id })
        await expect(storedText(`${samplePrefix}/sample.csv`)).rejects.toThrow()
    })

    it('edit: uploads new starter code and calls update action', async () => {
        const codeEnv = await insertCodeEnv()
        const onComplete = vi.fn()
        const { result } = renderHook(() => useCodeEnvForm(codeEnv, onComplete), {
            wrapper: createTestQueryWrapper(),
        })

        const newStarterCode = new File(['new code'], 'updated.py')
        act(() => {
            result.current.form.setFieldValue('starterCodes', [newStarterCode])
        })

        act(() => result.current.onSubmit())

        await waitForPendingMutations()
        const [updated] = await codeEnvsInOrg()
        expect(updated.starterCodeFileNames).toEqual(['updated.py'])
        const starterPath = pathForStarterCode({ orgSlug: org.slug, codeEnvId: codeEnv.id, fileName: 'updated.py' })
        expect(await storedText(starterPath)).toBe('new code')
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
        const legacyEnv = await insertCodeEnv({ url: 'python:3.11' })

        const { result } = renderHook(() => useCodeEnvForm(legacyEnv, vi.fn()), {
            wrapper: createTestQueryWrapper(),
        })

        expect(result.current.form.errors.digest).toBe('Image digest is required')

        act(() => result.current.onSubmit())
        await waitFor(() => expect(result.current.form.errors.digest).toBe('Image digest is required'))
        await waitForPendingMutations()
        expect((await codeEnvsInOrg())[0].url).toBe('python:3.11')

        act(() => result.current.form.setFieldValue('digest', 'a'.repeat(64)))
        act(() => result.current.onSubmit())
        await waitForPendingMutations()
        expect((await codeEnvsInOrg())[0].url).toBe(testImageRef('python:3.11'))
    })

    it('create: flags a truncated digest', async () => {
        const { result } = renderHook(() => useCodeEnvForm(undefined, vi.fn()), {
            wrapper: createTestQueryWrapper(),
        })
        act(() => result.current.form.setFieldValue('digest', 'sha256:771722e4'))

        act(() => result.current.onSubmit())

        await waitFor(() => expect(result.current.form.errors.digest).toMatch(/truncated/))
        await waitForPendingMutations()
        expect(await codeEnvsInOrg()).toEqual([])
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
        const codeEnv = await insertCodeEnv()
        const starterPath = pathForStarterCode({ orgSlug: org.slug, codeEnvId: codeEnv.id, fileName: 'main.py' })
        await storeS3File({ orgSlug: org.slug }, new Blob(['existing code']).stream(), starterPath)

        const { result } = renderHook(() => useCodeEnvForm(codeEnv, vi.fn()), {
            wrapper: createTestQueryWrapper(),
        })

        act(() => result.current.onSubmit())

        await waitForPendingMutations()
        expect((await codeEnvsInOrg())[0].starterCodeFileNames).toEqual(['main.py'])
        expect(await storedText(starterPath)).toBe('existing code')
    })

    it('edit: uploads sample data files', async () => {
        const codeEnv = await insertCodeEnv()
        const { result } = renderHook(() => useCodeEnvForm(codeEnv, vi.fn()), {
            wrapper: createTestQueryWrapper(),
        })

        const sampleFile = new File(['data'], 'data.csv')
        act(() => {
            result.current.setSampleDataFiles([sampleFile])
        })

        act(() => result.current.onSubmit())

        await waitForPendingMutations()
        const samplePrefix = pathForSampleData({ orgSlug: org.slug, codeEnvId: codeEnv.id })
        expect(await storedText(`${samplePrefix}/data.csv`)).toBe('data')
    })
})
