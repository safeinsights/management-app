import { vi, type Mock } from 'vitest'
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
import { useParams } from 'next/navigation'
import type { JobFileActivity } from '@/server/db/queries'
import type { JobFileInfo } from '@/lib/types'
import { useOutputsFiles } from './use-outputs-files'
import { fetchJobFileActivityAction } from '@/server/actions/study-job-file-activity.actions'

// Mocking one of our own actions goes against the usual rule, and it is the only way to reach these
// branches: a real action resolves or returns an error envelope, it never throws at the transport.
// These tests exist to prove a failed request is reported, so the failure is injected here (OTTER-726).
vi.mock('@/server/actions/study-job-file-activity.actions', () => ({
    fetchJobFileActivityAction: vi.fn(),
    recordJobFileActivityAction: vi.fn(),
}))

const ORG_SLUG = 'memorial'

const activityQueryKey = (jobId: string) => ['job-file-activity', jobId, ORG_SLUG]

const decryptedFile = (path: string): JobFileInfo =>
    ({ sourceId: faker.string.uuid(), path, contents: new ArrayBuffer(8) }) as JobFileInfo

const typedFile = (path: string, fileType: JobFileInfo['fileType']): JobFileInfo =>
    ({ sourceId: faker.string.uuid(), path, fileType, contents: new ArrayBuffer(8) }) as JobFileInfo

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
    ;(useParams as Mock).mockReturnValue({ orgSlug: ORG_SLUG })
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
    // OTTER-783: the server scopes the column to one side of the study by this slug.
    it('asks for the activity of the org in the URL', async () => {
        const jobId = faker.string.uuid()
        renderFiles(jobId, [decryptedFile('logs.json')])

        await waitFor(() => expect(fetchJobFileActivityAction).toHaveBeenCalledWith({ jobId, orgSlug: ORG_SLUG }))
    })

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

// Nothing ordered these rows before, so the list arrived in physical database order and the scan
// log moved between rounds (OTTER-758).
describe('useOutputsFiles row order', () => {
    const shuffled = () => [
        typedFile('tutor_results.csv', 'ENCRYPTED-RESULT'),
        typedFile('exercises_results.csv', 'ENCRYPTED-RESULT'),
        typedFile('a_plot.png', 'ENCRYPTED-RESULT'),
        typedFile('security-scan-log.txt', 'ENCRYPTED-SECURITY-SCAN-LOG'),
        typedFile('archive.zip', 'ENCRYPTED-RESULT'),
    ]

    it('lists the scan log first and the results alphabetically', () => {
        const { result } = renderFiles(faker.string.uuid(), shuffled(), [])

        expect(result.current.rows.map((row) => row.name)).toEqual([
            'security-scan-log.txt',
            'a_plot.png',
            'archive.zip',
            'exercises_results.csv',
            'tutor_results.csv',
        ])
    })

    it('leaves the array it was given untouched, because the researcher panels share it', () => {
        const files = shuffled()
        const asGiven = files.map((file) => file.path)

        renderFiles(faker.string.uuid(), files, [])

        expect(files.map((file) => file.path)).toEqual(asGiven)
    })

    it('sorts on the displayed name rather than the full archive path', () => {
        const files = [
            typedFile('zzz/a_plot.png', 'ENCRYPTED-RESULT'),
            typedFile('aaa/tutor_results.csv', 'ENCRYPTED-RESULT'),
        ]
        const { result } = renderFiles(faker.string.uuid(), files, [])

        expect(result.current.rows.map((row) => row.name)).toEqual(['a_plot.png', 'tutor_results.csv'])
    })
})
