import { describe, expect, it, vi, beforeEach } from 'vitest'
import { type Org } from '@/schema/org'
import {
    db,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    readTestSupportFile,
} from '@/tests/unit.helpers'
import { fireEvent, waitFor, screen } from '@testing-library/react'
import { EncryptedFilesPanel } from './encrypted-files-panel'
import { fetchApprovedJobFilesAction, fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import { latestJobForStudy } from '@/server/db/queries'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import { type FileType } from '@/database/types'

vi.mock('@/server/actions/study-job.actions', () => ({
    fetchApprovedJobFilesAction: vi.fn(() => []),
    fetchEncryptedJobFilesAction: vi.fn(() => []),
}))

describe('EncryptedFilesPanel', () => {
    let org: Org

    beforeEach(async () => {
        const resp = await mockSessionWithTestData()
        org = resp.org
    })

    it('returns null when no encrypted files exist', async () => {
        const { latestJobWithStatus: job } = await insertTestStudyJobData({
            org,
            jobStatus: 'RUN-COMPLETE',
        })

        const { container } = renderWithProviders(<EncryptedFilesPanel job={job} onFilesApproved={vi.fn()} />)
        expect(container.querySelector('form')).toBeNull()
        expect(screen.queryByText('Decrypt Files')).toBeNull()
    })

    it('shows file rows with lock icon and decrypt form when encrypted files exist', async () => {
        const { study, job } = await insertTestStudyJobData({
            org,
            jobStatus: 'RUN-COMPLETE',
        })

        await db
            .insertInto('studyJobFile')
            .values({
                studyJobId: job.id,
                name: 'results.zip',
                path: `test-org/${study.id}/${job.id}/results/results.zip`,
                fileType: 'ENCRYPTED-RESULT',
            })
            .execute()

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        // File row is visible in the table
        expect(screen.getByText('Results')).toBeDefined()
        expect(screen.getByText('results.zip')).toBeDefined()

        // No View or Download actions for locked files
        expect(screen.queryByRole('button', { name: 'View' })).toBeNull()
        expect(screen.queryByTestId('download-link')).toBeNull()

        // Decrypt form is present
        expect(screen.getByPlaceholderText('Enter your Reviewer key to access encrypted content.')).toBeDefined()
        expect(screen.getByRole('button', { name: 'Decrypt Files' })).toBeDefined()
    })

    it('shows file names and sizes from metadata before decryption', async () => {
        const { study, job } = await insertTestStudyJobData({
            org,
            jobStatus: 'RUN-COMPLETE',
        })

        await db
            .insertInto('studyJobFile')
            .values({
                studyJobId: job.id,
                name: 'results.zip',
                path: `test-org/${study.id}/${job.id}/results/results.zip`,
                fileType: 'ENCRYPTED-RESULT',
            })
            .execute()

        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([
            {
                blob: new Blob(),
                sourceId: '123',
                fileType: 'ENCRYPTED-RESULT',
                metadata: [{ path: 'results.csv', bytes: 2048 }],
            },
        ])

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        await waitFor(() => {
            expect(screen.getByText('results.csv')).toBeDefined()
            expect(screen.getByText('2.0 KB')).toBeDefined()
        })

        // Still locked — no View or Download
        expect(screen.queryByRole('button', { name: 'View' })).toBeNull()
        expect(screen.queryByTestId('download-link')).toBeNull()
    })

    it('shows one row per file when an encrypted archive contains multiple files', async () => {
        const { study, job } = await insertTestStudyJobData({
            org,
            jobStatus: 'RUN-COMPLETE',
        })

        await db
            .insertInto('studyJobFile')
            .values({
                studyJobId: job.id,
                name: 'results.zip',
                path: `test-org/${study.id}/${job.id}/results/results.zip`,
                fileType: 'ENCRYPTED-RESULT',
            })
            .execute()

        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([
            {
                blob: new Blob(),
                sourceId: '123',
                fileType: 'ENCRYPTED-RESULT',
                metadata: [
                    { path: 'first.csv', bytes: 1024 },
                    { path: 'second.csv', bytes: 2048 },
                ],
            },
        ])

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        await waitFor(() => {
            expect(screen.getByText('first.csv')).toBeDefined()
            expect(screen.getByText('second.csv')).toBeDefined()
            expect(screen.getByText('1.0 KB')).toBeDefined()
            expect(screen.getByText('2.0 KB')).toBeDefined()
        })

        // Aggregated "N files" placeholder should not appear
        expect(screen.queryByText('2 files')).toBeNull()
    })

    it('decrypts and shows file table with View and Download', async () => {
        const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
        const fingerprint = await fingerprintKeyData(publicKey)
        const writer = new ResultsWriter([{ publicKey, fingerprint }])

        const csv = 'name,age\nAlice,30'
        const csvBuf = Buffer.from(csv, 'utf-8')
        const arrayBuf = csvBuf.buffer.slice(csvBuf.byteOffset, csvBuf.byteOffset + csvBuf.length)

        await writer.addFile('results.csv', arrayBuf)
        const zip = await writer.generate()

        const file = {
            blob: new Blob([zip as BlobPart]),
            sourceId: '123',
            fileType: 'ENCRYPTED-RESULT' as FileType,
            metadata: [{ path: 'results.csv', bytes: 15 }],
        }

        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([file])

        const { study, job } = await insertTestStudyJobData({
            org,
            jobStatus: 'RUN-COMPLETE',
        })

        await db
            .insertInto('studyJobFile')
            .values({
                studyJobId: job.id,
                name: 'results.zip',
                path: `test-org/${study.id}/${job.id}/results/results.zip`,
                fileType: 'ENCRYPTED-RESULT',
            })
            .execute()

        const onFilesApproved = vi.fn()
        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={onFilesApproved} />)

        const input = screen.getByPlaceholderText('Enter your Reviewer key to access encrypted content.')
        const privateKey = await readTestSupportFile('private_key.pem')

        fireEvent.change(input, { target: { value: privateKey } })
        fireEvent.click(screen.getByRole('button', { name: 'Decrypt Files' }))

        await waitFor(() => {
            expect(screen.getByText('Results')).toBeDefined()
            expect(screen.getByRole('button', { name: 'View' })).toBeDefined()
            expect(screen.getByTestId('download-link')).toBeDefined()
            expect(onFilesApproved).toHaveBeenLastCalledWith([
                expect.objectContaining({
                    path: 'results.csv',
                    fileType: 'APPROVED-RESULT',
                    sourceId: '123',
                }),
            ])
        })
    })

    it('decrypts an archive with multiple files and shows one row per file', async () => {
        const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
        const fingerprint = await fingerprintKeyData(publicKey)
        const writer = new ResultsWriter([{ publicKey, fingerprint }])

        const csvA = 'name,age\nAlice,30'
        const csvABuf = Buffer.from(csvA, 'utf-8')
        const arrayBufA = csvABuf.buffer.slice(csvABuf.byteOffset, csvABuf.byteOffset + csvABuf.length)

        const csvB = 'city,state\nDenver,CO'
        const csvBBuf = Buffer.from(csvB, 'utf-8')
        const arrayBufB = csvBBuf.buffer.slice(csvBBuf.byteOffset, csvBBuf.byteOffset + csvBBuf.length)

        await writer.addFile('first.csv', arrayBufA)
        await writer.addFile('second.csv', arrayBufB)
        const zip = await writer.generate()

        const file = {
            blob: new Blob([zip as BlobPart]),
            sourceId: '123',
            fileType: 'ENCRYPTED-RESULT' as FileType,
            metadata: [
                { path: 'first.csv', bytes: arrayBufA.byteLength },
                { path: 'second.csv', bytes: arrayBufB.byteLength },
            ],
        }

        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([file])

        const { study, job } = await insertTestStudyJobData({
            org,
            jobStatus: 'RUN-COMPLETE',
        })

        await db
            .insertInto('studyJobFile')
            .values({
                studyJobId: job.id,
                name: 'results.zip',
                path: `test-org/${study.id}/${job.id}/results/results.zip`,
                fileType: 'ENCRYPTED-RESULT',
            })
            .execute()

        const onFilesApproved = vi.fn()
        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={onFilesApproved} />)

        const input = screen.getByPlaceholderText('Enter your Reviewer key to access encrypted content.')
        const privateKey = await readTestSupportFile('private_key.pem')

        fireEvent.change(input, { target: { value: privateKey } })
        fireEvent.click(screen.getByRole('button', { name: 'Decrypt Files' }))

        await waitFor(() => {
            expect(screen.getByText('first.csv')).toBeDefined()
            expect(screen.getByText('second.csv')).toBeDefined()
            expect(screen.getAllByRole('button', { name: 'View' })).toHaveLength(2)
            expect(screen.getAllByTestId('download-link')).toHaveLength(2)
        })

        await waitFor(() => {
            expect(onFilesApproved).toHaveBeenLastCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ path: 'first.csv', fileType: 'APPROVED-RESULT' }),
                    expect.objectContaining({ path: 'second.csv', fileType: 'APPROVED-RESULT' }),
                ]),
            )
        })
    })

    it('opens modal with CSV content rendered as table', async () => {
        const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
        const fingerprint = await fingerprintKeyData(publicKey)
        const writer = new ResultsWriter([{ publicKey, fingerprint }])

        const csv = 'name,age\nAlice,30'
        const csvBuf = Buffer.from(csv, 'utf-8')
        const arrayBuf = csvBuf.buffer.slice(csvBuf.byteOffset, csvBuf.byteOffset + csvBuf.length)

        await writer.addFile('results.csv', arrayBuf)
        const zip = await writer.generate()

        const file = {
            blob: new Blob([zip as BlobPart]),
            sourceId: '123',
            fileType: 'ENCRYPTED-RESULT' as FileType,
            metadata: [{ path: 'results.csv', bytes: 15 }],
        }

        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([file])

        const { study, job } = await insertTestStudyJobData({
            org,
            jobStatus: 'RUN-COMPLETE',
        })

        await db
            .insertInto('studyJobFile')
            .values({
                studyJobId: job.id,
                name: 'results.zip',
                path: `test-org/${study.id}/${job.id}/results/results.zip`,
                fileType: 'ENCRYPTED-RESULT',
            })
            .execute()

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        const input = screen.getByPlaceholderText('Enter your Reviewer key to access encrypted content.')
        const privateKey = await readTestSupportFile('private_key.pem')

        fireEvent.change(input, { target: { value: privateKey } })
        fireEvent.click(screen.getByRole('button', { name: 'Decrypt Files' }))

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'View' })).toBeDefined()
        })

        fireEvent.click(screen.getByRole('button', { name: 'View' }))

        await waitFor(() => {
            expect(screen.getByText('name')).toBeDefined()
            expect(screen.getByText('age')).toBeDefined()
            expect(screen.getByText('Alice')).toBeDefined()
            expect(screen.getByText('30')).toBeDefined()
        })
    })

    it('opens modal with text content rendered as code block for log files', async () => {
        const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
        const fingerprint = await fingerprintKeyData(publicKey)
        const writer = new ResultsWriter([{ publicKey, fingerprint }])

        const logContent = 'Security scan complete: no issues found.'
        const contentBuf = Buffer.from(logContent, 'utf-8')
        const arrayBuf = contentBuf.buffer.slice(contentBuf.byteOffset, contentBuf.byteOffset + contentBuf.length)

        await writer.addFile('scan-log.txt', arrayBuf)
        const zip = await writer.generate()

        const file = {
            blob: new Blob([zip as BlobPart]),
            sourceId: '123',
            fileType: 'ENCRYPTED-SECURITY-SCAN-LOG' as FileType,
            metadata: [{ path: 'scan-log.txt', bytes: 40 }],
        }

        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([file])

        const { study, job } = await insertTestStudyJobData({
            org,
            jobStatus: 'RUN-COMPLETE',
        })

        await db
            .insertInto('studyJobFile')
            .values({
                studyJobId: job.id,
                name: 'scan-log.zip',
                path: `test-org/${study.id}/${job.id}/results/scan-log.zip`,
                fileType: 'ENCRYPTED-SECURITY-SCAN-LOG',
            })
            .execute()

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        const input = screen.getByPlaceholderText('Enter your Reviewer key to access encrypted content.')
        const privateKey = await readTestSupportFile('private_key.pem')

        fireEvent.change(input, { target: { value: privateKey } })
        fireEvent.click(screen.getByRole('button', { name: 'Decrypt Files' }))

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'View' })).toBeDefined()
        })

        fireEvent.click(screen.getByRole('button', { name: 'View' }))

        await waitFor(() => {
            expect(screen.getByRole('dialog')).toBeDefined()
            expect(screen.getByText(logContent)).toBeDefined()
        })
    })

    it('shows a green check for shared files and a red "not shared" X for withheld files after approval', async () => {
        const { study, job } = await insertTestStudyJobData({
            org,
            jobStatus: 'FILES-APPROVED',
        })

        await db
            .insertInto('studyJobFile')
            .values([
                {
                    studyJobId: job.id,
                    name: 'results.zip',
                    path: `test-org/${study.id}/${job.id}/results/results.zip`,
                    fileType: 'ENCRYPTED-RESULT',
                },
                {
                    studyJobId: job.id,
                    name: 'first.csv',
                    path: `test-org/${study.id}/${job.id}/results/approved/first.csv`,
                    fileType: 'APPROVED-RESULT',
                },
            ])
            .execute()

        // The original archive contained two files; only first.csv was shared.
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([
            {
                blob: new Blob(),
                sourceId: '123',
                fileType: 'ENCRYPTED-RESULT',
                metadata: [
                    { path: 'first.csv', bytes: 1024 },
                    { path: 'second.csv', bytes: 2048 },
                ],
            },
        ])

        vi.mocked(fetchApprovedJobFilesAction).mockResolvedValue([
            {
                blob: new Blob(),
                sourceId: 'approved-1',
                fileType: 'APPROVED-RESULT',
                metadata: [{ path: 'first.csv', bytes: 1024 }],
            },
        ])

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        // Shared (green) and withheld (red X) states render from metadata without decrypting.
        await waitFor(() => {
            expect(screen.getByText('first.csv')).toBeDefined()
            expect(screen.getByLabelText('second.csv not shared with researcher')).toBeDefined()
        })
    })

    it('shows a red "not shared" X (not a lock icon) for an entire log type withheld after approval', async () => {
        const { study, job } = await insertTestStudyJobData({
            org,
            jobStatus: 'FILES-APPROVED',
        })

        await db
            .insertInto('studyJobFile')
            .values([
                {
                    studyJobId: job.id,
                    name: 'first.csv',
                    path: `test-org/${study.id}/${job.id}/results/approved/first.csv`,
                    fileType: 'APPROVED-RESULT',
                },
                {
                    studyJobId: job.id,
                    name: 'scan-log.zip',
                    path: `test-org/${study.id}/${job.id}/results/scan-log.zip`,
                    fileType: 'ENCRYPTED-SECURITY-SCAN-LOG',
                },
            ])
            .execute()

        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([
            {
                blob: new Blob(),
                sourceId: '123',
                fileType: 'ENCRYPTED-RESULT',
                metadata: [{ path: 'first.csv', bytes: 1024 }],
            },
            {
                blob: new Blob(),
                sourceId: '456',
                fileType: 'ENCRYPTED-SECURITY-SCAN-LOG',
                metadata: [{ path: 'scan-log.txt', bytes: 40 }],
            },
        ])

        vi.mocked(fetchApprovedJobFilesAction).mockResolvedValue([
            {
                blob: new Blob(),
                sourceId: 'approved-1',
                fileType: 'APPROVED-RESULT',
                metadata: [{ path: 'first.csv', bytes: 1024 }],
            },
        ])

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        await waitFor(() => {
            expect(screen.getByLabelText('scan-log.txt not shared with researcher')).toBeDefined()
        })
    })

    it('renders a placeholder row rather than silently dropping files when metadata is unavailable for an approved job', async () => {
        const { study, job } = await insertTestStudyJobData({
            org,
            jobStatus: 'FILES-APPROVED',
        })

        await db
            .insertInto('studyJobFile')
            .values({
                studyJobId: job.id,
                name: 'results.zip',
                path: `test-org/${study.id}/${job.id}/results/results.zip`,
                fileType: 'ENCRYPTED-RESULT',
            })
            .execute()

        // Encrypted-file metadata never arrives (fetch in flight or failed and swallowed by Sentry),
        // and there are no approved files yet — metaList and approvedFilesForType are both empty.
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([])
        vi.mocked(fetchApprovedJobFilesAction).mockResolvedValue([])

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        // The group still renders a placeholder row instead of an empty table; without metadata we
        // can't enumerate withheld files, so no "not shared" indicator is shown yet.
        await waitFor(() => {
            expect(screen.getByText('results.zip')).toBeDefined()
        })
        expect(screen.queryByLabelText(/not shared with researcher/)).toBeNull()
    })

    it('does not show any "not shared" indicator while a job is still under review', async () => {
        const { study, job } = await insertTestStudyJobData({
            org,
            jobStatus: 'RUN-COMPLETE',
        })

        await db
            .insertInto('studyJobFile')
            .values({
                studyJobId: job.id,
                name: 'results.zip',
                path: `test-org/${study.id}/${job.id}/results/results.zip`,
                fileType: 'ENCRYPTED-RESULT',
            })
            .execute()

        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([
            {
                blob: new Blob(),
                sourceId: '123',
                fileType: 'ENCRYPTED-RESULT',
                metadata: [{ path: 'results.csv', bytes: 2048 }],
            },
        ])

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        await waitFor(() => {
            expect(screen.getByText('results.csv')).toBeDefined()
        })

        expect(screen.queryByLabelText(/not shared with researcher/)).toBeNull()
    })
})
