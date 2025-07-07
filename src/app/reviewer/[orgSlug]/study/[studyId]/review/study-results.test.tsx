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
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import { FileType, StudyJobStatus, StudyStatus } from '@/database/types'
import { JobFile } from '@/lib/types'

const mockedApprovedJobFiles: JobFile[] = [
    {
        contents: new TextEncoder().encode('title\nhello world').buffer as ArrayBuffer,
        path: 'approved.csv',
        fileType: 'APPROVED-RESULT' as FileType,
    },
]

vi.mock('@/server/actions/study-job.actions', () => ({
    fetchApprovedJobFilesAction: vi.fn(() => mockedApprovedJobFiles),
    fetchEncryptedJobFilesAction: vi.fn(() => 'Encrypted Results'),
}))

describe('View Study Results', () => {
    let org: Org

    beforeEach(async () => {
        const resp = await mockSessionWithTestData()
        org = resp.org
    })

    const insertAndRender = async (studyStatus: StudyStatus, jobStatus: StudyJobStatus) => {
        const { org } = await mockSessionWithTestData()
        const { latestJobWithStatus: job } = await insertTestStudyJobData({ org, studyStatus, jobStatus })
        const helpers = renderWithProviders(<StudyResults job={job} />)
        return { ...helpers, job, org }
    }

    it('shows empty results state when no job exists', async () => {
        renderWithProviders(<StudyResults job={null} />)
        expect(screen.queryByText('Study results are not available yet')).toBeDefined()
    })

    it('shows results rejected state', async () => {
        await insertAndRender('PENDING-REVIEW', 'FILES-REJECTED')
        expect(screen.queryByText('Latest results rejected')).toBeDefined()
    })

    it('renders the results if the job has been approved', async () => {
        await insertAndRender('APPROVED', 'FILES-APPROVED')
        await waitFor(() => {
            expect(screen.getByRole('link', { name: /Download/i })).toBeDefined()
        })
    })

    it('renders the form to unlock results', async () => {
        await insertAndRender('PENDING-REVIEW', 'RUN-COMPLETE')
        expect(screen.queryByText('Latest results rejected')).toBeDefined()
    })

    it('decrypts and displays the results', async () => {
        // Capture blobs created for the download link so we can verify their contents
        const createdBlobs: Blob[] = []
        const originalCreateObjectURL = URL.createObjectURL
        vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => {
            const blob = obj as Blob
            createdBlobs.push(blob)
            // keep default behavior so href still looks like a real blob url
            return originalCreateObjectURL ? originalCreateObjectURL.call(URL, blob) : 'blob://mock'
        })

        const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
        const fingerprint = await fingerprintKeyData(publicKey)
        const writer = new ResultsWriter([{ publicKey, fingerprint }])

        const csv = `title\nhello world`
        const csvBlob = Buffer.from(csv, 'utf-8')
        const arrayBuf = csvBlob.buffer.slice(csvBlob.byteOffset, csvBlob.byteOffset + csvBlob.length)

        await writer.addFile('test.data', arrayBuf)
        const zip = await writer.generate()

        const file = {
            blob: zip,
            sourceId: '123',
            fileType: 'ENCRYPTED-RESULT' as FileType,
        }

        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([file])

        const { latestJobWithStatus: job } = await insertTestStudyJobData({
            org,
            jobStatus: 'RUN-COMPLETE',
        })
        renderWithProviders(<StudyResults job={job} />)

        const input = screen.getByPlaceholderText('Enter your Reviewer key to access encrypted content.')

        const privateKey = await readTestSupportFile('private_key.pem')

        fireEvent.change(input, { target: { value: privateKey } })
        fireEvent.click(screen.getByRole('button', { name: 'View Results' }))

        await waitFor(() => {
            const link = screen.getByTestId('download-link')
            expect(link.getAttribute('href')).toMatch(/^blob:/)
            expect(link.getAttribute('download')).toEqual('approved.csv')
            expect(createdBlobs.length).toBeGreaterThan(0)
        })

        // Verify that the blob contains the expected CSV content
        const blobText = await createdBlobs[0].text()
        expect(blobText).toEqual(csv)
    })
})
