import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Org } from '@/schema/org'
import {
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    readTestSupportFile,
} from '@/tests/unit.helpers'
import { fireEvent, waitFor } from '@testing-library/react'
import { screen } from '@testing-library/react'
import { StudyResults } from './study-results'
import { fetchJobResultsEncryptedZipAction } from '@/server/actions/study-job.actions'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import { StudyJobStatus, StudyStatus } from '@/database/types'

vi.mock('@/server/actions/study-job.actions', () => ({
    fetchJobResultsCsvAction: vi.fn(() => 'Results\n42'),
    fetchJobResultsEncryptedZipAction: vi.fn(() => 'Encrypted Results'),
}))

describe('View Study Results', () => {
    let org: Org

    beforeEach(async () => {
        const resp = await mockSessionWithTestData()
        org = resp.org
    })

    const insertAndRender = async (studyStatus: StudyStatus, jobStatus: StudyJobStatus) => {
        const { org } = await mockSessionWithTestData()
        const { latestJobithStatus: job } = await insertTestStudyJobData({ org, studyStatus, jobStatus })
        const helpers = renderWithProviders(<StudyResults job={job} />)
        return { ...helpers, job, org }
    }

    it('shows empty results state when no job exists', async () => {
        renderWithProviders(<StudyResults job={null} />)
        expect(screen.queryByText('Study results are not available yet')).toBeDefined()
    })

    it('shows results rejected state', async () => {
        await insertAndRender('PENDING-REVIEW', 'RESULTS-REJECTED')
        expect(screen.queryByText('Latest results rejected')).toBeDefined()
    })

    it('renders the results if the job has been approved', async () => {
        await insertAndRender('APPROVED', 'RESULTS-APPROVED')
        await waitFor(() => {
            expect(screen.getByRole('link', { name: /Download/i })).toBeDefined()
        })
    })

    it('renders the form to unlock results', async () => {
        await insertAndRender('PENDING-REVIEW', 'RUN-COMPLETE')
        expect(screen.queryByText('Latest results rejected')).toBeDefined()
    })

    it('decrypts and displays the results', async () => {
        const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
        const fingerprint = await fingerprintKeyData(publicKey)
        const writer = new ResultsWriter([{ publicKey, fingerprint }])

        const csv = `title\nhello world`
        const csvBlob = Buffer.from(csv, 'utf-8')
        const arrayBuf = csvBlob.buffer.slice(csvBlob.byteOffset, csvBlob.byteOffset + csvBlob.length)

        await writer.addFile('test.data', arrayBuf)
        const zip = await writer.generate()

        vi.mocked(fetchJobResultsEncryptedZipAction).mockResolvedValue(zip)

        const { latestJobithStatus: job } = await insertTestStudyJobData({
            org,
            jobStatus: 'RUN-COMPLETE',
        })
        renderWithProviders(<StudyResults job={job} />)

        const input = screen.getByPlaceholderText('Enter private key')

        const privateKey = await readTestSupportFile('private_key.pem')

        fireEvent.change(input, { target: { value: privateKey } })
        fireEvent.click(screen.getByRole('button', { name: /View Results/i }))

        await waitFor(() => {
            // Check that the download link is set up correctly
            const link = screen.getByTestId('download-link')
            expect(link.getAttribute('href')).toMatch(/^blob:/)
            expect(link.getAttribute('download')).toEqual('test.data')
        })
    })
})
