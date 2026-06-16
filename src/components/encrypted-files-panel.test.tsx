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

// Encrypt one results artifact the way TOA would (the prod whole-zip format with an embedded
// manifest), persist the matching study_job_file row, and return the artifact entry the
// fetchEncryptedJobFilesAction mock will serve. The reviewer is a manifest recipient, so the
// override map is empty — they decrypt with their own key (no per-file re-wrapped keys needed).
async function seedArtifact(
    job: MinimalJob,
    { fileType, subdir, files }: { fileType: FileType; subdir: string; files: { name: string; content: string }[] },
) {
    const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
    const fingerprint = await fingerprintKeyData(publicKey)
    const writer = new ResultsWriter([{ publicKey, fingerprint }])
    for (const f of files) await writer.addFile(f.name, toArrayBuffer(f.content))
    const zip = await writer.generate()

    const path = `test-org/${job.id}/results/${subdir}/encrypted-results.zip`
    const row = await db
        .insertInto('studyJobFile')
        .values({ studyJobId: job.id, name: 'encrypted-results.zip', path, fileType })
        .returning('id')
        .executeTakeFirstOrThrow()

    return {
        studyJobFileId: row.id,
        fileType,
        name: 'encrypted-results.zip',
        encryptedBody: await zip.arrayBuffer(),
        overrideKeys: {} as Record<string, string>,
    }
}

// A display-only encrypted-artifact row (no real ciphertext) for lock/shared states.
async function insertEncryptedRow(job: MinimalJob, { fileType, subdir }: { fileType: FileType; subdir: string }) {
    return db
        .insertInto('studyJobFile')
        .values({
            studyJobId: job.id,
            name: 'encrypted-results.zip',
            path: `test-org/${job.id}/results/${subdir}/encrypted-results.zip`,
            fileType,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
}

const READER_KEY_PLACEHOLDER = 'Enter your Results Key to access encrypted content.'

async function enterKeyAndDecrypt() {
    fireEvent.change(screen.getByPlaceholderText(READER_KEY_PLACEHOLDER), {
        target: { value: await readTestSupportFile('private_key.pem') },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Decrypt Files' }))
}

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

    it('shows a locked artifact row and the decrypt form when an encrypted artifact exists', async () => {
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        await insertEncryptedRow(job, { fileType: 'ENCRYPTED-RESULT', subdir: 'encrypted' })

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        expect(screen.getByText('Results')).toBeDefined()
        expect(screen.getByLabelText('Encrypted')).toBeDefined()

        // Locked → no View/Download
        expect(screen.queryByRole('button', { name: 'View' })).toBeNull()
        expect(screen.queryByTestId('download-link')).toBeNull()

        expect(screen.getByPlaceholderText(READER_KEY_PLACEHOLDER)).toBeDefined()
        expect(screen.getByRole('button', { name: 'Decrypt Files' })).toBeDefined()
    })

    it('shows one locked row per encrypted artifact (results + logs)', async () => {
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        await insertEncryptedRow(job, { fileType: 'ENCRYPTED-RESULT', subdir: 'encrypted' })
        await insertEncryptedRow(job, { fileType: 'ENCRYPTED-SECURITY-SCAN-LOG', subdir: 'encrypted-logs' })

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        await waitFor(() => {
            expect(screen.getByText('Results')).toBeDefined()
            expect(screen.getByText('Security Scan Log')).toBeDefined()
        })
    })

    it('decrypts the artifact and shows its inner files with View and Download', async () => {
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        const artifact = await seedArtifact(job, {
            fileType: 'ENCRYPTED-RESULT',
            subdir: 'encrypted',
            files: [{ name: 'results.csv', content: 'name,age\nAlice,30' }],
        })
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([artifact])

        const onFilesApproved = vi.fn()
        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={onFilesApproved} />)

        await enterKeyAndDecrypt()

        await waitFor(() => {
            expect(screen.getByText('results.csv')).toBeDefined()
            expect(screen.getByRole('button', { name: 'View' })).toBeDefined()
            expect(screen.getByTestId('download-link')).toBeDefined()
            expect(onFilesApproved).toHaveBeenLastCalledWith([
                expect.objectContaining({
                    path: 'results.csv',
                    fileType: 'APPROVED-RESULT',
                    sourceId: artifact.studyJobFileId,
                }),
            ])
        })
    })

    it('decrypts an artifact with multiple inner files and shows one row each', async () => {
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        const artifact = await seedArtifact(job, {
            fileType: 'ENCRYPTED-RESULT',
            subdir: 'encrypted',
            files: [
                { name: 'first.csv', content: 'name,age\nAlice,30' },
                { name: 'second.csv', content: 'city,state\nDenver,CO' },
            ],
        })
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([artifact])

        const onFilesApproved = vi.fn()
        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={onFilesApproved} />)

        await enterKeyAndDecrypt()

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
        const artifact = await seedArtifact(job, {
            fileType: 'ENCRYPTED-RESULT',
            subdir: 'encrypted',
            files: [{ name: 'results.csv', content: 'name,age\nAlice,30' }],
        })
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([artifact])

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        await enterKeyAndDecrypt()

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
        const artifact = await seedArtifact(job, {
            fileType: 'ENCRYPTED-SECURITY-SCAN-LOG',
            subdir: 'encrypted-logs',
            files: [{ name: 'scan-log.txt', content: logContent }],
        })
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([artifact])

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        await enterKeyAndDecrypt()

        await waitFor(() => expect(screen.getByRole('button', { name: 'View' })).toBeDefined())
        fireEvent.click(screen.getByRole('button', { name: 'View' }))

        await waitFor(() => {
            expect(screen.getByRole('dialog')).toBeDefined()
            expect(screen.getByText(logContent)).toBeDefined()
        })
    })

    it('shows a green "shared with researcher" check on an approved artifact', async () => {
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'FILES-APPROVED' })
        const shared = await insertEncryptedRow(job, { fileType: 'ENCRYPTED-RESULT', subdir: 'encrypted' })

        // All-or-nothing: once approved every artifact is shared (getSharedFileIdsForJob returns all).
        vi.mocked(fetchSharedFileIdsAction).mockResolvedValue([shared.id])

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        await waitFor(() => {
            expect(screen.getByText('Results')).toBeDefined()
            expect(screen.getByLabelText('Shared with researcher')).toBeDefined()
        })
    })

    it('shows a lock (no shared check) while a job is still under review', async () => {
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        await insertEncryptedRow(job, { fileType: 'ENCRYPTED-RESULT', subdir: 'encrypted' })

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<EncryptedFilesPanel job={latestJob} onFilesApproved={vi.fn()} />)

        await waitFor(() => expect(screen.getByText('Results')).toBeDefined())
        expect(screen.queryByLabelText('Shared with researcher')).toBeNull()
        expect(screen.getByLabelText('Encrypted')).toBeDefined()
    })
})
