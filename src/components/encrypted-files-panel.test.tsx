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
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
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
            expect(onFilesApproved).toHaveBeenCalled()
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
})
