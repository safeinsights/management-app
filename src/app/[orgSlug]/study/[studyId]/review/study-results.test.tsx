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
import { fetchEncryptedJobFilesAction, fetchSharedFileIdsAction } from '@/server/actions/study-job.actions'
import { latestJobForStudy } from '@/server/db/queries'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import { type FileType, type StudyJobStatus, type StudyStatus } from '@/database/types'

vi.mock('@/server/actions/study-job.actions', () => ({
    fetchEncryptedJobFilesAction: vi.fn(() => []),
    fetchSharedFileIdsAction: vi.fn(() => []),
}))

const toArrayBuffer = (str: string): ArrayBuffer => {
    const buf = Buffer.from(str, 'utf-8')
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

type MinimalJob = { id: string }

async function seedEncryptedFile(
    job: MinimalJob,
    { name, fileType, content }: { name: string; fileType: FileType; content: string },
) {
    const publicKey = pemToArrayBuffer(await readTestSupportFile('public_key.pem'))
    const fingerprint = await fingerprintKeyData(publicKey)
    const writer = new ResultsWriter([{ publicKey, fingerprint }])
    await writer.addFile(name, toArrayBuffer(content))
    const zip = await writer.generate()

    const path = `test-org/${job.id}/results/encrypted-results.zip`
    const row = await db
        .insertInto('studyJobFile')
        .values({ studyJobId: job.id, name, path, fileType })
        .returning('id')
        .executeTakeFirstOrThrow()

    return {
        studyJobFileId: row.id,
        fileType,
        name,
        encryptedBody: await zip.arrayBuffer(),
        overrideKeys: {} as Record<string, string>,
    }
}

async function insertEncryptedRow(job: MinimalJob, { name, fileType }: { name: string; fileType: FileType }) {
    return db
        .insertInto('studyJobFile')
        .values({
            studyJobId: job.id,
            name,
            path: `test-org/${job.id}/results/encrypted/${name}`,
            fileType,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
}

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
        expect(
            screen.getByText(/The results have been rejected and will not be shared with the researcher/),
        ).toBeDefined()
    })

    it('renders the shared result file once the job has been approved', async () => {
        const { study, latestJobWithStatus: rawJob } = await insertTestStudyJobData({
            org,
            studyStatus: 'APPROVED',
            jobStatus: 'FILES-APPROVED',
        })

        const shared = await insertEncryptedRow(rawJob, { name: 'approved.csv', fileType: 'ENCRYPTED-RESULT' })
        vi.mocked(fetchSharedFileIdsAction).mockResolvedValue([shared.id])

        const job = await latestJobForStudy(study.id)
        renderWithProviders(<StudyResults job={job} />)

        // One row per file; the shared file shows by name (content needs decryption).
        await waitFor(() => {
            expect(screen.getByText('approved.csv')).toBeDefined()
        })
        expect(screen.getAllByText('approved.csv')).toHaveLength(1)
    })

    it('does not duplicate rows when multiple result files are shared', async () => {
        const { study, latestJobWithStatus: rawJob } = await insertTestStudyJobData({
            org,
            studyStatus: 'APPROVED',
            jobStatus: 'FILES-APPROVED',
        })

        const first = await insertEncryptedRow(rawJob, { name: 'results.csv', fileType: 'ENCRYPTED-RESULT' })
        const second = await insertEncryptedRow(rawJob, { name: 'results2.csv', fileType: 'ENCRYPTED-RESULT' })
        vi.mocked(fetchSharedFileIdsAction).mockResolvedValue([first.id, second.id])

        const job = await latestJobForStudy(study.id)
        renderWithProviders(<StudyResults job={job} />)

        await waitFor(() => {
            expect(screen.getAllByText('results.csv')).toHaveLength(1)
            expect(screen.getAllByText('results2.csv')).toHaveLength(1)
        })
    })

    it('renders the form to unlock results', async () => {
        await insertAndRender('PENDING-REVIEW', 'RUN-COMPLETE')
        expect(screen.getByText(/Review results before these can be released/)).toBeDefined()
    })

    it('shows no logs message and hides decrypt UI when JOB-ERRORED has no encrypted logs', async () => {
        const { study } = await insertTestStudyJobData({ org, jobStatus: 'JOB-ERRORED' })
        const job = await latestJobForStudy(study.id)

        renderWithProviders(<StudyResults job={job} />)

        expect(screen.getByText(/While logs are not available at this time/)).toBeDefined()
        expect(screen.queryByPlaceholderText('Enter your Results Key to access encrypted content.')).toBeNull()
        expect(screen.queryByText(/Review the error logs/)).toBeNull()
        expect(screen.queryByText('Job ID:')).toBeNull()
    })

    it('shows error message and decrypt UI when JOB-ERRORED has encrypted logs', async () => {
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'JOB-ERRORED' })
        await insertEncryptedRow(job, { name: 'packaging-error.log', fileType: 'ENCRYPTED-PACKAGING-ERROR-LOG' })

        const latestJob = await latestJobForStudy(study.id)
        renderWithProviders(<StudyResults job={latestJob} />)

        expect(screen.getByText(/Review the error logs before these can be shared with the researcher/)).toBeDefined()
        expect(screen.getByText('Job ID:')).toBeDefined()
        expect(screen.getByPlaceholderText('Enter your Results Key to access encrypted content.')).toBeDefined()
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

        const csv = `title\nhello world`

        const { study, job: rawJob } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        const file = await seedEncryptedFile(rawJob, { name: 'test.data', fileType: 'ENCRYPTED-RESULT', content: csv })
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([file])

        const job = await latestJobForStudy(study.id)
        renderWithProviders(<StudyResults job={job} />)

        const input = screen.getByPlaceholderText('Enter your Results Key to access encrypted content.')
        fireEvent.change(input, { target: { value: await readTestSupportFile('private_key.pem') } })
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
