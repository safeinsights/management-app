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
import { StudyResults } from './study-results'
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import { latestJobForStudy } from '@/server/db/queries'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import { type FileType, type StudyJobStatus, type StudyStatus } from '@/database/types'
import { type JobFile } from '@/lib/types'

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

    it('distinguishes build/scan error (errored before JOB-READY) and shows base image info', async () => {
        const { study } = await insertTestStudyJobData({
            org,
            language: 'R',
            jobStatus: 'JOB-ERRORED',
        })
        const job = await latestJobForStudy(study.id)

        renderWithProviders(<StudyResults job={job} />)

        expect(screen.getByText('Building researcher code failed!')).toBeDefined()
        expect(screen.getByText('Maybe check the base image or contact support.')).toBeDefined()

        // build/scan errors should not prompt reviewers to decrypt results/logs
        expect(screen.queryByPlaceholderText('Enter your Reviewer key to access encrypted content.')).toBeNull()

        // build/scan errors should not show runtime error help text
        expect(
            screen.queryByText(
                'The code errored out! Review the error logs before these can be shared with the researcher.',
            ),
        ).toBeNull()
        expect(screen.queryByText('Job ID:')).toBeNull()
    })

    it('distinguishes build/scan error (errored before JOB-READY) and does not show decrypt UI', async () => {
        const { study } = await insertTestStudyJobData({
            org,
            language: 'R',
            jobStatus: 'JOB-ERRORED',
        })

        const job = await latestJobForStudy(study.id)
        renderWithProviders(<StudyResults job={job} />)

        expect(screen.getByText('Building researcher code failed!')).toBeDefined()
        expect(screen.getByText('Maybe check the base image or contact support.')).toBeDefined()

        // build/scan errors should not prompt reviewers to decrypt results/logs
        expect(screen.queryByPlaceholderText('Enter your Reviewer key to access encrypted content.')).toBeNull()
    })

    it('distinguishes run error (errored after JOB-READY) and still shows decrypt UI', async () => {
        const { study, job } = await insertTestStudyJobData({
            org,
            jobStatus: 'JOB-READY',
        })

        await db
            .insertInto('jobStatusChange')
            .values({
                status: 'JOB-ERRORED',
                studyJobId: job.id,
                userId: study.researcherId,
            })
            .execute()

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<StudyResults job={latestJob} />)

        expect(
            screen.getByText(
                'The code errored out! Review the error logs before these can be shared with the researcher.',
            ),
        ).toBeDefined()
        expect(screen.getByText('Job ID:')).toBeDefined()
        expect(screen.getByPlaceholderText('Enter your Reviewer key to access encrypted content.')).toBeDefined()

        // runtime errors should not be treated as build/scan errors
        expect(screen.queryByText('Building researcher code failed!')).toBeNull()
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
            blob: new Blob([zip as BlobPart]),
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
