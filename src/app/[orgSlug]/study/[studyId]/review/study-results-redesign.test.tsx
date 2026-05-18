import { describe, expect, it, vi, beforeEach } from 'vitest'
import { type Org } from '@/schema/org'
import { db, insertTestStudyJobData, mockSessionWithTestData, renderWithProviders } from '@/tests/unit.helpers'
import { screen } from '@testing-library/react'
import { StudyResultsRedesign } from './study-results-redesign'
import { latestJobForStudy } from '@/server/db/queries'
import { type FileType } from '@/database/types'
import { type JobFile } from '@/lib/types'

// OTTER-538: focused tests for the redesigned StudyResults panel.
// The redesign (1) always shows the updated secondary text, (2) hides the
// results table until the reviewer's key successfully decrypts, and (3)
// drops the "Enter Reviewer Key to view…" label above the key input.

const mockedApprovedJobFiles: JobFile[] = []

vi.mock('@/server/actions/study-job.actions', () => ({
    fetchApprovedJobFilesAction: vi.fn(() => mockedApprovedJobFiles),
    fetchEncryptedJobFilesAction: vi.fn(() => []),
}))

const NEW_SECONDARY_TEXT =
    'The code was successfully processed! Review results and security logs (if available) to decide if these can be released to the researcher.'

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

        await db
            .insertInto('studyJobFile')
            .values({
                studyJobId: (await latestJobForStudy(study.id))!.id,
                name: 'results.zip',
                path: `test-org/${study.id}/results.zip`,
                fileType: 'ENCRYPTED-RESULT' as FileType,
            })
            .execute()

        const job = await latestJobForStudy(study.id)
        renderWithProviders(<StudyResultsRedesign job={job!} />)

        expect(screen.getByText(NEW_SECONDARY_TEXT)).toBeInTheDocument()
        expect(screen.getByPlaceholderText('Enter your Reviewer key to access encrypted content.')).toBeInTheDocument()
        expect(screen.queryByText(/Enter Reviewer Key to view/i)).not.toBeInTheDocument()
    })

    it('hides the file table until decryption succeeds', async () => {
        const { study } = await insertTestStudyJobData({
            org,
            studyStatus: 'PENDING-REVIEW',
            jobStatus: 'RUN-COMPLETE',
        })

        await db
            .insertInto('studyJobFile')
            .values({
                studyJobId: (await latestJobForStudy(study.id))!.id,
                name: 'results.zip',
                path: `test-org/${study.id}/results.zip`,
                fileType: 'ENCRYPTED-RESULT' as FileType,
            })
            .execute()

        const job = await latestJobForStudy(study.id)
        renderWithProviders(<StudyResultsRedesign job={job!} />)

        // pre-decryption: the unified file table (rendered as a Mantine Table)
        // should not appear. The decrypt form is the only thing besides the header.
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })
})
