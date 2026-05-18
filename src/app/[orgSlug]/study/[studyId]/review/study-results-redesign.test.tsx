import { describe, expect, it, vi, beforeEach } from 'vitest'
import { type Org } from '@/schema/org'
import {
    db,
    insertTestStudyJobData,
    mockSessionWithTestData,
    readTestSupportFile,
    renderWithProviders,
} from '@/tests/unit.helpers'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { StudyResultsRedesign } from './study-results-redesign'
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import { latestJobForStudy } from '@/server/db/queries'
import { ResultsWriter } from 'si-encryption/job-results/writer'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import { type FileType } from '@/database/types'
import { type JobFile } from '@/lib/types'

// OTTER-538: focused tests for the redesigned StudyResults panel.
// The redesign (1) shows the RUN-COMPLETE secondary text on RUN-COMPLETE, (2) hides
// the results table until the reviewer's key successfully decrypts, (3) drops the
// "Enter Reviewer Key to view…" label above the key input, and (4) defers to
// JobStatusHelpText for terminal non-COMPLETE statuses so an errored or rejected
// job doesn't claim it was "successfully processed".

const mockedApprovedJobFiles: JobFile[] = []

vi.mock('@/server/actions/study-job.actions', () => ({
    fetchApprovedJobFilesAction: vi.fn(() => mockedApprovedJobFiles),
    fetchEncryptedJobFilesAction: vi.fn(() => []),
}))

const RUN_COMPLETE_SECONDARY_TEXT =
    'The code was successfully processed! Review results and security logs (if available) to decide if these can be released to the researcher.'

async function seedEncryptedResult(studyId: string) {
    await db
        .insertInto('studyJobFile')
        .values({
            studyJobId: (await latestJobForStudy(studyId))!.id,
            name: 'results.zip',
            path: `test-org/${studyId}/results.zip`,
            fileType: 'ENCRYPTED-RESULT' as FileType,
        })
        .execute()
}

describe('StudyResultsRedesign', () => {
    let org: Org

    beforeEach(async () => {
        const resp = await mockSessionWithTestData()
        org = resp.org
    })

    it('shows the new secondary text and the decrypt form (no label) before the key is entered', async () => {
        const { study } = await insertTestStudyJobData({
            org,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'RUN-COMPLETE',
        })

        await seedEncryptedResult(study.id)

        const job = await latestJobForStudy(study.id)
        renderWithProviders(<StudyResultsRedesign job={job!} />)

        expect(screen.getByText(RUN_COMPLETE_SECONDARY_TEXT)).toBeInTheDocument()
        expect(screen.getByPlaceholderText('Enter your Reviewer key to access encrypted content.')).toBeInTheDocument()
        expect(screen.queryByText(/Enter Reviewer Key to view/i)).not.toBeInTheDocument()
    })

    it('hides the file table until decryption succeeds', async () => {
        const { study } = await insertTestStudyJobData({
            org,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'RUN-COMPLETE',
        })

        await seedEncryptedResult(study.id)

        const job = await latestJobForStudy(study.id)
        renderWithProviders(<StudyResultsRedesign job={job!} />)

        // pre-decryption: the unified file table (rendered as a Mantine Table)
        // should not appear. The decrypt form is the only thing besides the header.
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })

    it('reveals the file table and Approve/Reject buttons after successful decryption', async () => {
        const originalCreateObjectURL = URL.createObjectURL
        vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => {
            const blob = obj as Blob
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

        const encryptedFile = {
            blob: new Blob([zip as BlobPart]),
            sourceId: '123',
            fileType: 'ENCRYPTED-RESULT' as FileType,
            metadata: [{ path: 'test.data', bytes: 4 }],
        }
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([encryptedFile])

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
        renderWithProviders(<StudyResultsRedesign job={job!} />)

        // Pre-decrypt: no table, no Approve/Reject buttons (JobReviewButtons returns null
        // when decryptedResults is undefined — see job-review-buttons.tsx).
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /^Approve$/ })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /^Reject$/ })).not.toBeInTheDocument()

        const privateKey = await readTestSupportFile('private_key.pem')
        const input = screen.getByPlaceholderText('Enter your Reviewer key to access encrypted content.')
        fireEvent.change(input, { target: { value: privateKey } })
        fireEvent.click(screen.getByRole('button', { name: 'Decrypt Files' }))

        await waitFor(() => {
            expect(screen.getByRole('table')).toBeInTheDocument()
        })
        expect(screen.getByRole('button', { name: /^Approve$/ })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^Reject$/ })).toBeInTheDocument()
    })

    it('renders the JOB-ERRORED help text instead of the RUN-COMPLETE secondary text', async () => {
        const { study } = await insertTestStudyJobData({
            org,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'JOB-ERRORED',
        })

        const job = await latestJobForStudy(study.id)
        renderWithProviders(<StudyResultsRedesign job={job!} />)

        expect(screen.queryByText(RUN_COMPLETE_SECONDARY_TEXT)).not.toBeInTheDocument()
        expect(screen.getByText(/The code errored out!/)).toBeInTheDocument()
    })

    it('renders the FILES-REJECTED help text instead of the RUN-COMPLETE secondary text', async () => {
        const { study } = await insertTestStudyJobData({
            org,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'FILES-REJECTED',
        })

        const job = await latestJobForStudy(study.id)
        renderWithProviders(<StudyResultsRedesign job={job!} />)

        expect(screen.queryByText(RUN_COMPLETE_SECONDARY_TEXT)).not.toBeInTheDocument()
        expect(
            screen.getByText(/The results have been rejected and will not be shared with the researcher/),
        ).toBeInTheDocument()
    })
})
