import React from 'react'
import { db } from '@/database'
import { notifications } from '@mantine/notifications'
import {
    act,
    createTestQueryClient,
    describe,
    expect,
    expectStudyJobRecords,
    faker,
    insertTestOrg,
    it,
    mockSessionWithTestData,
    QueryClientProvider,
    renderHook,
    waitFor,
} from '@/tests/unit.helpers'
import { vi } from 'vitest'
import { useSubmitStudy, type UseSubmitStudyOptions } from './use-submit-study'

vi.mock('@/hooks/upload', () => ({
    uploadFiles: vi.fn(),
}))

vi.mock('@/server/aws', async () => {
    const actual = await vi.importActual('@/server/aws')
    return {
        ...actual,
        createSignedUploadUrl: vi.fn().mockResolvedValue('https://upload.example.com'),
        deleteFolderContents: vi.fn(),
        triggerScanForStudyJob: vi.fn(),
    }
})

vi.mock('@/server/events', () => ({
    deferred: <T extends (...args: never[]) => unknown>(fn: T) => fn,
    onStudyCreated: vi.fn(),
    onStudyCodeSubmitted: vi.fn(),
}))

import { uploadFiles } from '@/hooks/upload'

function createWrapper() {
    const client = createTestQueryClient()
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    Wrapper.displayName = 'TestWrapper'
    return Wrapper
}

async function setupDraftStudy() {
    const enclaveSlug = `review-org-${faker.string.alpha(8)}`
    const labSlug = `lab-org-${faker.string.alpha(8)}`
    const enclave = await insertTestOrg({ slug: enclaveSlug, type: 'enclave' })
    const { org: lab, user } = await mockSessionWithTestData({ orgSlug: labSlug, orgType: 'lab' })

    const study = await db
        .insertInto('study')
        .values({
            orgId: enclave.id,
            submittedByOrgId: lab.id,
            containerLocation: 'test-container',
            title: 'Draft integration test study',
            researcherId: user.id,
            piName: 'Dr. Integration',
            status: 'DRAFT',
            dataSources: ['all'],
            outputMimeType: 'application/zip',
            language: 'R',
        })
        .returningAll()
        .executeTakeFirstOrThrow()

    return { study, user }
}

function renderSubmitHook(options: UseSubmitStudyOptions) {
    return renderHook(() => useSubmitStudy(options), { wrapper: createWrapper() })
}

describe('useSubmitStudy integration', () => {
    it('creates job records and finalizes draft submission after upload succeeds', async () => {
        const { study } = await setupDraftStudy()
        const mainFile = new File(['main'], 'main.R', { type: 'text/plain' })
        const helperFile = new File(['helper'], 'helper.R', { type: 'text/plain' })

        vi.mocked(uploadFiles).mockResolvedValue([])

        const { result } = renderSubmitHook({
            studyId: study.id,
            mainFileName: mainFile.name,
            additionalFileNames: [helperFile.name],
            codeSource: 'upload',
            codeFiles: {
                mainFile: { type: 'memory', file: mainFile },
                additionalFiles: [{ type: 'memory', file: helperFile }],
            },
        })

        act(() => result.current.submitStudy())

        await waitFor(async () => {
            const updatedStudy = await db
                .selectFrom('study')
                .select(['status'])
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()

            expect(updatedStudy.status).toBe('PENDING-REVIEW')
        })

        const uploadedFiles = vi.mocked(uploadFiles).mock.calls[0]?.[0]
        expect(uploadedFiles).toHaveLength(2)
        expect(uploadedFiles?.map(([file]) => file?.name)).toEqual(['main.R', 'helper.R'])
        expect(uploadedFiles?.[0]?.[1]).toBe(uploadedFiles?.[1]?.[1])

        await expectStudyJobRecords(study.id, [
            { name: 'main.R', fileType: 'MAIN-CODE' },
            { name: 'helper.R', fileType: 'SUPPLEMENTAL-CODE' },
        ])

        expect(notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({
                color: 'green',
                title: 'Study Code Submitted',
            }),
        )
    })

    it('deletes the created job and keeps the study draft when upload fails', async () => {
        const { study } = await setupDraftStudy()
        const mainFile = new File(['main'], 'main.R', { type: 'text/plain' })

        vi.mocked(uploadFiles).mockRejectedValue(new Error('Upload failed'))

        const { result } = renderSubmitHook({
            studyId: study.id,
            mainFileName: mainFile.name,
            additionalFileNames: [],
            codeSource: 'upload',
            codeFiles: {
                mainFile: { type: 'memory', file: mainFile },
                additionalFiles: [],
            },
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

        const updatedStudy = await db
            .selectFrom('study')
            .select(['status'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updatedStudy.status).toBe('DRAFT')

        const jobs = await db.selectFrom('studyJob').select(['id']).where('studyId', '=', study.id).execute()
        expect(jobs).toHaveLength(0)
    })
})
