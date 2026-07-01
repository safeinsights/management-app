import { describe, expect, it, vi, beforeEach } from 'vitest'
import { type Org } from '@/schema/org'
import { db, insertTestStudyJobData, mockSessionWithTestData, renderWithProviders } from '@/tests/unit.helpers'
import { waitFor, screen } from '@testing-library/react'
import { JobResults } from './job-results'
import { fetchApprovedJobFilesAction, fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import { latestJobForStudy } from '@/server/db/queries'
import { type FileType } from '@/database/types'

vi.mock('@/server/actions/study-job.actions', () => ({
    fetchApprovedJobFilesAction: vi.fn(() => []),
    fetchEncryptedJobFilesAction: vi.fn(() => []),
    fetchSharedFileIdsAction: vi.fn(() => []),
}))

const mockFetchApproved = vi.mocked(fetchApprovedJobFilesAction)
const mockFetchEncrypted = vi.mocked(fetchEncryptedJobFilesAction)

const toArrayBuffer = (str: string): ArrayBuffer => {
    const buf = Buffer.from(str, 'utf-8')
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

type MinimalJob = { id: string }

async function insertJobFile(job: MinimalJob, { fileType, name }: { fileType: FileType; name: string }) {
    return db
        .insertInto('studyJobFile')
        .values({ studyJobId: job.id, name, path: `test-org/${job.id}/results/${name}`, fileType })
        .returning('id')
        .executeTakeFirstOrThrow()
}

describe('JobResults', () => {
    let org: Org

    beforeEach(async () => {
        const resp = await mockSessionWithTestData()
        org = resp.org
    })

    // Legacy (pre-PR #764): plaintext APPROVED-RESULT rows, no key. Results must render directly,
    // routed through fetchApprovedJobFilesAction — and the encrypted decrypt path must NOT run.
    it('renders legacy plaintext results without a decrypt key prompt', async () => {
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        await insertJobFile(job, { fileType: 'APPROVED-RESULT', name: 'results.csv' })
        mockFetchApproved.mockResolvedValueOnce([
            { contents: toArrayBuffer('a,b\n1,2'), path: 'results.csv', fileType: 'APPROVED-RESULT' },
        ])

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<JobResults job={latestJob} />)

        await waitFor(() => {
            expect(screen.getByText('Results:')).toBeInTheDocument()
        })
        expect(mockFetchApproved).toHaveBeenCalled()
        expect(mockFetchEncrypted).not.toHaveBeenCalled()
        expect(screen.queryByText('Decrypt Files')).toBeNull()
        expect(screen.queryByPlaceholderText(/Results Key/i)).toBeNull()
    })

    // Encrypted (post-PR #764): ENCRYPTED-RESULT rows still flow through the decrypt panel. With an
    // accessible (wrapped-key) artifact, the researcher sees a locked row and the key form — and the
    // legacy fetch must NOT run.
    it('routes encrypted results through the decrypt panel (locked row + key form)', async () => {
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        const row = await insertJobFile(job, { fileType: 'ENCRYPTED-RESULT', name: 'encrypted-results.zip' })
        mockFetchEncrypted.mockResolvedValueOnce([
            {
                studyJobFileId: row.id,
                fileType: 'ENCRYPTED-RESULT',
                name: 'encrypted-results.zip',
                encryptedBody: toArrayBuffer('ciphertext'),
                recipientKeys: {},
            },
        ])

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<JobResults job={latestJob} />)

        await waitFor(() => {
            expect(screen.getByLabelText('Encrypted')).toBeInTheDocument()
        })
        expect(screen.getByRole('button', { name: 'Decrypt Files' })).toBeInTheDocument()
        expect(mockFetchApproved).not.toHaveBeenCalled()
    })

    // A job with both encrypted and legacy artifacts (defensive) stays on the encrypted path so
    // nothing decryptable is silently dropped.
    it('prefers the encrypted path when a job has both encrypted and legacy artifacts', async () => {
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        await insertJobFile(job, { fileType: 'APPROVED-RESULT', name: 'results.csv' })
        const row = await insertJobFile(job, { fileType: 'ENCRYPTED-RESULT', name: 'encrypted-results.zip' })
        mockFetchEncrypted.mockResolvedValueOnce([
            {
                studyJobFileId: row.id,
                fileType: 'ENCRYPTED-RESULT',
                name: 'encrypted-results.zip',
                encryptedBody: toArrayBuffer('ciphertext'),
                recipientKeys: {},
            },
        ])

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<JobResults job={latestJob} />)

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Decrypt Files' })).toBeInTheDocument()
        })
        expect(mockFetchApproved).not.toHaveBeenCalled()
    })
})
