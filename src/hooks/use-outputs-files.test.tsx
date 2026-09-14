import { vi } from 'vitest'
import {
    createTestQueryClient,
    describe,
    expect,
    faker,
    it,
    QueryClientProvider,
    renderHook,
    waitFor,
} from '@/tests/unit.helpers'
import type { ReactNode } from 'react'
import type { JobFileActivity } from '@/server/db/queries'
import type { JobFileInfo } from '@/lib/types'
import { useOutputsFiles } from './use-outputs-files'

// Mocking one of our own actions goes against the usual rule, and it is the only way to reach these
// branches: a real action resolves or returns an error envelope, it never throws at the transport.
// These tests exist to prove a failed request is reported, so the failure is injected here (OTTER-726).
vi.mock('@/server/actions/study-job-file-activity.actions', () => ({
    fetchJobFileActivityAction: vi.fn(),
    recordJobFileActivityAction: vi.fn(),
}))

const activityQueryKey = (jobId: string) => ['job-file-activity', jobId]

const decryptedFile = (path: string): JobFileInfo =>
    ({ sourceId: faker.string.uuid(), path, contents: new ArrayBuffer(8) }) as JobFileInfo

const activityFor = (file: JobFileInfo): JobFileActivity => ({
    studyJobFileId: file.sourceId,
    filePath: file.path,
    action: 'VIEWED',
    createdAt: new Date('2026-08-11T13:53:00Z'),
    actorName: 'Malar Natarajan',
})

// The client is returned so a test can put the query into states the action alone cannot produce.
// createTestQueryClient sets refetchOnMount false, so seeded data is served without a request.
const renderFiles = (jobId: string, decryptedFiles: JobFileInfo[], seed?: JobFileActivity[]) => {
    const client = createTestQueryClient()
    if (seed) client.setQueryData(activityQueryKey(jobId), seed)
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    return { client, ...renderHook(() => useOutputsFiles({ jobId, decryptedFiles }), { wrapper }) }
}

const failRefetch = async (client: ReturnType<typeof createTestQueryClient>, jobId: string) => {
    await client
        .fetchQuery({
            queryKey: activityQueryKey(jobId),
            queryFn: () => Promise.reject(new Error('refetch failed')),
            retry: false,
        })
        .catch(() => undefined)

    await waitFor(() => {
        expect(client.getQueryState(activityQueryKey(jobId))?.status).toBe('error')
    })
}

describe('useOutputsFiles activity display', () => {
    it('asserts nothing about activity while the first request is in flight', () => {
        const file = decryptedFile('logs.json')
        const { result } = renderFiles(faker.string.uuid(), [file])

        expect(result.current.rows[0].activityState).toBe('pending')
        expect(result.current.rows[0].activity).toBeNull()
    })

    it('reports a known empty result so the row can say there has been no activity', () => {
        const file = decryptedFile('logs.json')
        const { result } = renderFiles(faker.string.uuid(), [file], [])

        expect(result.current.rows[0].activityState).toBe('known')
        expect(result.current.rows[0].activity).toBeNull()
    })

    it('carries the actor, action and time for a file that has activity', () => {
        const file = decryptedFile('security-scan-log.txt')
        const { result } = renderFiles(faker.string.uuid(), [file], [activityFor(file)])

        expect(result.current.rows[0].activityState).toBe('known')
        expect(result.current.rows[0].activity).toMatchObject({ actorName: 'Malar Natarajan', action: 'VIEWED' })
    })

    // OTTER-726: TanStack keeps the last good data through a failed refetch, so reading the data
    // alone presented rows from before the failure as a statement about now.
    it('drops the last known activity when a background refetch fails', async () => {
        const jobId = faker.string.uuid()
        const file = decryptedFile('security-scan-log.txt')
        const { result, client } = renderFiles(jobId, [file], [activityFor(file)])

        await failRefetch(client, jobId)

        expect(result.current.rows[0].activityState).toBe('unavailable')
        expect(result.current.rows[0].activity).toBeNull()
    })

    it('opts the activity poll in to the shared error reporter', () => {
        const jobId = faker.string.uuid()
        const { client } = renderFiles(jobId, [decryptedFile('logs.json')], [])

        expect(client.getQueryCache().find({ queryKey: activityQueryKey(jobId) })?.meta).toEqual({
            errorMessage: 'Failed to load file activity',
        })
    })
})
