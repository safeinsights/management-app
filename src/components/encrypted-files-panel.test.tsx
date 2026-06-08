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
import { fetchEncryptedJobFilesAction, fetchSharedFileIdsAction } from '@/server/actions/study-job.actions'
import { latestJobForStudy } from '@/server/db/queries'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { decomposeResultsZip } from 'si-encryption/job-results/decompose'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import { type FileType } from '@/database/types'

vi.mock('@/server/actions/study-job.actions', () => ({
    fetchEncryptedJobFilesAction: vi.fn(() => []),
    fetchSharedFileIdsAction: vi.fn(() => []),
}))

const toArrayBuffer = (str: string): ArrayBuffer => {
    const buf = Buffer.from(str, 'utf-8')
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

type MinimalJob = { id: string }

// Insert one decomposed encrypted-file row, with a real (decryptable) body the
// fetchEncryptedJobFilesAction mock will serve. Returns the row id so callers can
// match it to the per-file fetch entry.
async function seedEncryptedFile(
    job: MinimalJob,
    { name, fileType, content }: { name: string; fileType: FileType; content: string },
) {
    const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
    const fingerprint = await fingerprintKeyData(publicKey)
    const writer = new ResultsWriter([{ publicKey, fingerprint }])
    await writer.addFile(name, toArrayBuffer(content))
    const [decomposed] = await decomposeResultsZip(await writer.generate())

    const row = await db
        .insertInto('studyJobFile')
        .values({
            studyJobId: job.id,
            name,
            path: `test-org/${job.id}/results/encrypted/${name}`,
            fileType,
            iv: decomposed.iv,
            bytes: decomposed.bytes,
        })
        .returning('id')
        .executeTakeFirstOrThrow()

    return {
        studyJobFileId: row.id,
        fileType,
        path: `test-org/${job.id}/results/encrypted/${name}`,
        name,
        iv: decomposed.iv,
        crypt: decomposed.keys[fingerprint].crypt,
        encryptedBody: decomposed.body,
    }
}

// A display-only encrypted-file row (no real ciphertext) for lock/shared/withheld states.
async function insertEncryptedRow(
    job: MinimalJob,
    { name, fileType, bytes }: { name: string; fileType: FileType; bytes?: number },
) {
    return db
        .insertInto('studyJobFile')
        .values({
            studyJobId: job.id,
            name,
            path: `test-org/${job.id}/results/encrypted/${name}`,
            fileType,
            iv: 'aXY=',
            bytes: bytes ?? null,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
}

const READER_KEY_PLACEHOLDER = 'Enter your Reviewer key to access encrypted content.'

describe('EncryptedFilesPanel', () => {
    let org: Org

    beforeEach(async () => {
        const resp = await mockSessionWithTestData()
        org = resp.org
    })

    it('returns null when no encrypted files exist', async () => {
        const { latestJobWithStatus: job } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })

        const { container } = renderWithProviders(<EncryptedFilesPanel job={job} onFilesApproved={vi.fn()} />)
        expect(container.querySelector('form')).toBeNull()
        expect(screen.queryByText('Decrypt Files')).toBeNull()
    })

    it('shows a file row with lock icon and the decrypt form when an encrypted file exists', async () => {
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        await insertEncryptedRow(job, { name: 'results.csv', fileType: 'ENCRYPTED-RESULT', bytes: 2048 })

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        expect(screen.getByText('Results')).toBeDefined()
        expect(screen.getByText('results.csv')).toBeDefined()
        expect(screen.getByText('2.0 KB')).toBeDefined()

        // Locked → no View/Download
        expect(screen.queryByRole('button', { name: 'View' })).toBeNull()
        expect(screen.queryByTestId('download-link')).toBeNull()

        expect(screen.getByPlaceholderText(READER_KEY_PLACEHOLDER)).toBeDefined()
        expect(screen.getByRole('button', { name: 'Decrypt Files' })).toBeDefined()
    })

    it('shows one row per file when the job has multiple encrypted files', async () => {
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        await insertEncryptedRow(job, { name: 'first.csv', fileType: 'ENCRYPTED-RESULT', bytes: 1024 })
        await insertEncryptedRow(job, { name: 'second.csv', fileType: 'ENCRYPTED-RESULT', bytes: 2048 })

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        await waitFor(() => {
            expect(screen.getByText('first.csv')).toBeDefined()
            expect(screen.getByText('second.csv')).toBeDefined()
            expect(screen.getByText('1.0 KB')).toBeDefined()
            expect(screen.getByText('2.0 KB')).toBeDefined()
        })
    })

    it('decrypts and shows the file table with View and Download', async () => {
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        const file = await seedEncryptedFile(job, {
            name: 'results.csv',
            fileType: 'ENCRYPTED-RESULT',
            content: 'name,age\nAlice,30',
        })
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([file])

        const onFilesApproved = vi.fn()
        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={onFilesApproved} />)

        fireEvent.change(screen.getByPlaceholderText(READER_KEY_PLACEHOLDER), {
            target: { value: await readTestSupportFile('private_key.pem') },
        })
        fireEvent.click(screen.getByRole('button', { name: 'Decrypt Files' }))

        await waitFor(() => {
            expect(screen.getByText('Results')).toBeDefined()
            expect(screen.getByRole('button', { name: 'View' })).toBeDefined()
            expect(screen.getByTestId('download-link')).toBeDefined()
            expect(onFilesApproved).toHaveBeenLastCalledWith([
                expect.objectContaining({
                    path: 'results.csv',
                    fileType: 'APPROVED-RESULT',
                    sourceId: file.studyJobFileId,
                }),
            ])
        })
    })

    it('decrypts multiple files and shows one row per file', async () => {
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        const first = await seedEncryptedFile(job, {
            name: 'first.csv',
            fileType: 'ENCRYPTED-RESULT',
            content: 'name,age\nAlice,30',
        })
        const second = await seedEncryptedFile(job, {
            name: 'second.csv',
            fileType: 'ENCRYPTED-RESULT',
            content: 'city,state\nDenver,CO',
        })
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([first, second])

        const onFilesApproved = vi.fn()
        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={onFilesApproved} />)

        fireEvent.change(screen.getByPlaceholderText(READER_KEY_PLACEHOLDER), {
            target: { value: await readTestSupportFile('private_key.pem') },
        })
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

    it('opens a modal with CSV content rendered as a table', async () => {
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        const file = await seedEncryptedFile(job, {
            name: 'results.csv',
            fileType: 'ENCRYPTED-RESULT',
            content: 'name,age\nAlice,30',
        })
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([file])

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        fireEvent.change(screen.getByPlaceholderText(READER_KEY_PLACEHOLDER), {
            target: { value: await readTestSupportFile('private_key.pem') },
        })
        fireEvent.click(screen.getByRole('button', { name: 'Decrypt Files' }))

        await waitFor(() => expect(screen.getByRole('button', { name: 'View' })).toBeDefined())
        fireEvent.click(screen.getByRole('button', { name: 'View' }))

        await waitFor(() => {
            expect(screen.getByText('name')).toBeDefined()
            expect(screen.getByText('age')).toBeDefined()
            expect(screen.getByText('Alice')).toBeDefined()
            expect(screen.getByText('30')).toBeDefined()
        })
    })

    it('opens a modal with text content rendered as a code block for log files', async () => {
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        const logContent = 'Security scan complete: no issues found.'
        const file = await seedEncryptedFile(job, {
            name: 'scan-log.txt',
            fileType: 'ENCRYPTED-SECURITY-SCAN-LOG',
            content: logContent,
        })
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([file])

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        fireEvent.change(screen.getByPlaceholderText(READER_KEY_PLACEHOLDER), {
            target: { value: await readTestSupportFile('private_key.pem') },
        })
        fireEvent.click(screen.getByRole('button', { name: 'Decrypt Files' }))

        await waitFor(() => expect(screen.getByRole('button', { name: 'View' })).toBeDefined())
        fireEvent.click(screen.getByRole('button', { name: 'View' }))

        await waitFor(() => {
            expect(screen.getByRole('dialog')).toBeDefined()
            expect(screen.getByText(logContent)).toBeDefined()
        })
    })

    it('shows a green check for shared files and a red "not shared" X for withheld files after approval', async () => {
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'FILES-APPROVED' })
        const shared = await insertEncryptedRow(job, { name: 'first.csv', fileType: 'ENCRYPTED-RESULT', bytes: 1024 })
        await insertEncryptedRow(job, { name: 'second.csv', fileType: 'ENCRYPTED-RESULT', bytes: 2048 })

        // Only first.csv has a researcher PO box → it's the shared/approved one.
        vi.mocked(fetchSharedFileIdsAction).mockResolvedValue([shared.id])

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        await waitFor(() => {
            expect(screen.getByText('first.csv')).toBeDefined()
            expect(screen.getByLabelText('second.csv not shared with researcher')).toBeDefined()
        })
    })

    it('shows a red "not shared" X for a withheld log file after approval', async () => {
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'FILES-APPROVED' })
        const shared = await insertEncryptedRow(job, { name: 'first.csv', fileType: 'ENCRYPTED-RESULT', bytes: 1024 })
        await insertEncryptedRow(job, { name: 'scan-log.txt', fileType: 'ENCRYPTED-SECURITY-SCAN-LOG', bytes: 40 })

        vi.mocked(fetchSharedFileIdsAction).mockResolvedValue([shared.id])

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        await waitFor(() => {
            expect(screen.getByLabelText('scan-log.txt not shared with researcher')).toBeDefined()
        })
    })

    it('does not show any "not shared" indicator while a job is still under review', async () => {
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        await insertEncryptedRow(job, { name: 'results.csv', fileType: 'ENCRYPTED-RESULT', bytes: 2048 })

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        await waitFor(() => {
            expect(screen.getByText('results.csv')).toBeDefined()
        })
        expect(screen.queryByLabelText(/not shared with researcher/)).toBeNull()
    })
})
