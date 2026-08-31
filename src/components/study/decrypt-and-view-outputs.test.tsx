import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    fireEvent,
    insertTestStudyJobData,
    mockSessionWithTestData,
    readTestSupportFile,
    renderWithProviders,
    screen,
    waitFor,
} from '@/tests/unit.helpers'
import { type Org } from '@/schema/org'
import { latestJobForStudy, type LatestJobForStudy } from '@/server/db/queries'
import { seedEncryptedArtifact } from '@/tests/artifact.helpers'
import { DecryptAndViewOutputs } from './decrypt-and-view-outputs'

vi.mock('@/server/actions/study-job.actions', () => ({
    fetchEncryptedJobFilesAction: vi.fn(() => []),
}))

vi.mock('@/server/actions/study-job-file-activity.actions', () => ({
    fetchJobFileActivityAction: vi.fn(() => []),
    recordJobFileActivityAction: vi.fn(() => ({})),
}))

describe('DecryptAndViewOutputs', () => {
    let org: Org
    let job: NonNullable<LatestJobForStudy>

    beforeEach(async () => {
        const resp = await mockSessionWithTestData()
        org = resp.org
        const { study } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        job = (await latestJobForStudy(study.id))!

        const { fetchEncryptedJobFilesAction } = await import('@/server/actions/study-job.actions')
        const artifact = await seedEncryptedArtifact(job.id, {
            fileType: 'ENCRYPTED-RESULT',
            files: [{ name: 'summary.csv', content: 'a,b\n1,2' }],
        })
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([artifact])
    })

    it('renders the View outputs again security-key copy (OTTER-677 overrides)', async () => {
        renderWithProviders(<DecryptAndViewOutputs job={job} isVisible />)

        await screen.findByRole('button', { name: 'View' })

        expect(screen.getByRole('heading', { name: /view outputs again/i })).toBeInTheDocument()
        expect(
            screen.getByText('The outputs are encrypted. Enter your security key to view them again.'),
        ).toBeInTheDocument()
        expect(screen.queryByTestId('outputs-files-section')).not.toBeInTheDocument()
    })

    // A run closed out with nothing to decrypt (OTTER-524) would otherwise be asked for a key that
    // could never open anything, because there is nothing to open.
    it('renders nothing when the job holds no artifact a key could open', async () => {
        renderWithProviders(<DecryptAndViewOutputs job={job} isVisible={false} />)

        expect(screen.queryByRole('heading', { name: /view outputs again/i })).not.toBeInTheDocument()
        expect(screen.queryByTestId('security-key-form')).not.toBeInTheDocument()
    })

    it('replaces the form with the output files table after a successful decrypt', async () => {
        const privateKeyPem = await readTestSupportFile('private_key.pem')
        renderWithProviders(<DecryptAndViewOutputs job={job} isVisible />)

        await screen.findByRole('button', { name: 'View' })
        fireEvent.change(screen.getByRole('textbox'), { target: { value: privateKeyPem } })
        fireEvent.click(screen.getByRole('button', { name: 'View' }))

        await waitFor(() => {
            expect(screen.getByTestId('outputs-files-section')).toBeInTheDocument()
        })
        expect(screen.queryByRole('heading', { name: /view outputs again/i })).not.toBeInTheDocument()
        expect(screen.queryByTestId('security-key-form')).not.toBeInTheDocument()
        expect(screen.getByText('summary.csv')).toBeInTheDocument()
    })
})
