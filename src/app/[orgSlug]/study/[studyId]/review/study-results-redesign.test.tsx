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

// OTTER-538: focused tests for the redesigned StudyResults panel.
// The redesign (1) shows the RUN-COMPLETE secondary text on RUN-COMPLETE, (2) hides
// the results table until the reviewer's key successfully decrypts, (3) drops the
// "Enter Reviewer Key to view…" label above the key input, and (4) defers to
// JobStatusHelpText for terminal non-COMPLETE statuses so an errored or rejected
// job doesn't claim it was "successfully processed".

vi.mock('@/server/actions/study-job.actions', () => ({
    fetchEncryptedJobFilesAction: vi.fn(() => []),
    fetchSharedFileIdsAction: vi.fn(() => []),
}))

const toArrayBuffer = (str: string): ArrayBuffer => {
    const buf = Buffer.from(str, 'utf-8')
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

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
        expect(screen.getByPlaceholderText('Enter your Results Key to access encrypted content.')).toBeInTheDocument()
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
        await writer.addFile('test.data', toArrayBuffer(csv))
        const zip = await writer.generate()

        const { study, job: rawJob } = await insertTestStudyJobData({
            org,
            jobStatus: 'RUN-COMPLETE',
        })
        const path = `test-org/${study.id}/${rawJob.id}/results/encrypted-results.zip`
        const row = await db
            .insertInto('studyJobFile')
            .values({
                studyJobId: rawJob.id,
                name: 'test.data',
                path,
                fileType: 'ENCRYPTED-RESULT',
            })
            .returning('id')
            .executeTakeFirstOrThrow()

        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([
            {
                studyJobFileId: row.id,
                fileType: 'ENCRYPTED-RESULT' as FileType,
                name: 'test.data',
                encryptedBody: await zip.arrayBuffer(),
                researcherKeys: {} as Record<string, string>,
            },
        ])

        const job = await latestJobForStudy(study.id)
        renderWithProviders(<StudyResultsRedesign job={job!} />)

        // Pre-decrypt: no table, no Approve/Reject buttons (JobReviewButtons returns null
        // when decryptedResults is undefined — see job-review-buttons.tsx).
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /^Approve$/ })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /^Reject$/ })).not.toBeInTheDocument()

        const privateKey = await readTestSupportFile('private_key.pem')
        const input = screen.getByPlaceholderText('Enter your Results Key to access encrypted content.')
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
