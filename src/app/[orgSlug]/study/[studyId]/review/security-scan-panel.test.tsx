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
import { SecurityScanPanel } from './security-scan-panel'
import { fetchEncryptedScanLogsAction } from '@/server/actions/study-job.actions'
import { latestJobForStudy } from '@/server/db/queries'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import { type FileType } from '@/database/types'

vi.mock('@/server/actions/study-job.actions', () => ({
    fetchEncryptedScanLogsAction: vi.fn(() => []),
}))

describe('SecurityScanPanel', () => {
    let org: Org

    beforeEach(async () => {
        const resp = await mockSessionWithTestData()
        org = resp.org
    })

    it('returns null when job has no CODE-SCANNED status', async () => {
        const { latestJobWithStatus: job } = await insertTestStudyJobData({
            org,
            jobStatus: 'JOB-READY',
        })

        renderWithProviders(<SecurityScanPanel job={job} />)
        expect(screen.queryByText('View Security Scan')).toBeNull()
    })

    it('returns null when CODE-SCANNED but no ENCRYPTED-SECURITY-SCAN-LOG files', async () => {
        const { latestJobWithStatus: job } = await insertTestStudyJobData({
            org,
            jobStatus: 'CODE-SCANNED',
        })

        renderWithProviders(<SecurityScanPanel job={job} />)
        expect(screen.queryByText('View Security Scan')).toBeNull()
    })

    it('renders decrypt form when CODE-SCANNED with scan log files present', async () => {
        const { study, job } = await insertTestStudyJobData({
            org,
            jobStatus: 'CODE-SCANNED',
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
        renderWithProviders(<SecurityScanPanel job={latestJob} />)

        expect(screen.getByText('View Security Scan')).toBeDefined()
        expect(screen.getByPlaceholderText('Enter your Reviewer key to decrypt the security scan log.')).toBeDefined()
        expect(screen.getByRole('button', { name: 'Decrypt Scan Log' })).toBeDefined()
    })

    it('decrypts and shows scan log in modal', async () => {
        const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
        const fingerprint = await fingerprintKeyData(publicKey)
        const writer = new ResultsWriter([{ publicKey, fingerprint }])

        const scanContent = 'Security scan complete: no issues found.'
        const contentBuf = Buffer.from(scanContent, 'utf-8')
        const arrayBuf = contentBuf.buffer.slice(contentBuf.byteOffset, contentBuf.byteOffset + contentBuf.length)

        await writer.addFile('scan-log.txt', arrayBuf)
        const zip = await writer.generate()

        const file = {
            blob: new Blob([zip as BlobPart]),
            sourceId: '123',
            fileType: 'ENCRYPTED-SECURITY-SCAN-LOG' as FileType,
        }

        vi.mocked(fetchEncryptedScanLogsAction).mockResolvedValue([file])

        const { study, job } = await insertTestStudyJobData({
            org,
            jobStatus: 'CODE-SCANNED',
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
        renderWithProviders(<SecurityScanPanel job={latestJob} />)

        const input = screen.getByPlaceholderText('Enter your Reviewer key to decrypt the security scan log.')
        const privateKey = await readTestSupportFile('private_key.pem')

        fireEvent.change(input, { target: { value: privateKey } })
        fireEvent.click(screen.getByRole('button', { name: 'Decrypt Scan Log' }))

        await waitFor(() => {
            expect(screen.getByText('Security Scan Log')).toBeDefined()
            expect(screen.getByText(scanContent)).toBeDefined()
        })
    })
})
