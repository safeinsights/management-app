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
    fetchEncryptedJobFilesAction: vi.fn(() => []),
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

    it('shows no logs message and hides decrypt UI when JOB-ERRORED has no encrypted logs', async () => {
        const { study } = await insertTestStudyJobData({
            org,
            jobStatus: 'JOB-ERRORED',
        })
        const job = await latestJobForStudy(study.id)

        renderWithProviders(<StudyResults job={job} />)

        expect(screen.getByText(/While logs are not available at this time/)).toBeDefined()
        expect(screen.queryByPlaceholderText('Enter your Reviewer key to access encrypted content.')).toBeNull()
        expect(screen.queryByText(/Review the error logs/)).toBeNull()
        expect(screen.queryByText('Job ID:')).toBeNull()
    })

    it('shows error message and decrypt UI when JOB-ERRORED has encrypted logs', async () => {
        const { study, job } = await insertTestStudyJobData({
            org,
            jobStatus: 'JOB-ERRORED',
        })

        await db
            .insertInto('studyJobFile')
            .values({
                studyJobId: job.id,
                name: 'encrypted-logs.zip',
                path: `test-org/${study.id}/${job.id}/results/encrypted-logs.zip`,
                fileType: 'ENCRYPTED-PACKAGING-ERROR-LOG',
            })
            .execute()

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<StudyResults job={latestJob} />)

        expect(screen.getByText(/Review the error logs before these can be shared with the researcher/)).toBeDefined()
        expect(screen.getByText('Job ID:')).toBeDefined()
        expect(screen.getByPlaceholderText('Enter your Reviewer key to access encrypted content.')).toBeDefined()
        expect(screen.queryByText(/While logs are not available at this time/)).toBeNull()
    })

    it('decrypts and displays the results', async () => {
        const createdBlobs: Blob[] = []
        const originalCreateObjectURL = URL.createObjectURL
        vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => {
            const blob = obj as Blob
            createdBlobs.push(blob)
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

        const { study, job: rawJob } = await insertTestStudyJobData({
            org,
            jobStatus: 'RUN-COMPLETE',
        })

        await db
            .insertInto('studyJobFile')
            .values({
                studyJobId: rawJob.id,
                name: 'results.zip',
                path: `test-org/${study.id}/${rawJob.id}/results/results.zip`,
                fileType: 'ENCRYPTED-RESULT',
            })
            .execute()

        const job = await latestJobForStudy(study.id)
        renderWithProviders(<StudyResults job={job} />)

        const input = screen.getByPlaceholderText('Enter your Reviewer key to access encrypted content.')

        const privateKey = await readTestSupportFile('private_key.pem')

        fireEvent.change(input, { target: { value: privateKey } })
        fireEvent.click(screen.getByRole('button', { name: 'Decrypt Files' }))

        await waitFor(() => {
            const link = screen.getByTestId('download-link')
            expect(link.getAttribute('href')).toMatch(/^blob:/)
            expect(createdBlobs.length).toBeGreaterThan(0)
        })

        const blobText = await createdBlobs[0].text()
        expect(blobText).toEqual(csv)
    })
})
