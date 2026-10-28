import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import {
    db,
    fireEvent,
    insertTestStudyJobData,
    mockSessionWithTestData,
    readTestSupportFile,
    renderWithProviders,
    screen,
    waitFor,
} from '@/tests/unit.helpers'
import { latestJobForStudy, type LatestJobForStudy } from '@/server/db/queries'
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import { seedEncryptedArtifact } from '@/tests/artifact.helpers'
import { CodeRunKeyForm } from './code-run-key-form'

vi.mock('@/server/actions/study-job.actions', () => ({
    fetchEncryptedJobFilesAction: vi.fn(() => []),
}))

const DESCRIPTION =
    'Output files are encrypted. Enter your security key to access outputs from this and previous code runs.'

describe('CodeRunKeyForm', () => {
    let job: NonNullable<LatestJobForStudy>
    let onDecrypted: Mock

    beforeEach(async () => {
        const { org } = await mockSessionWithTestData()
        const { study, job: dbJob } = await insertTestStudyJobData({ org, jobStatus: 'JOB-ERRORED' })
        await db
            .updateTable('jobStatusChange')
            .set({ createdAt: new Date('2026-03-05T12:00:00Z') })
            .where('studyJobId', '=', dbJob.id)
            .where('status', '=', 'JOB-ERRORED')
            .execute()
        job = (await latestJobForStudy(study.id))!
        onDecrypted = vi.fn()

        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([
            await seedEncryptedArtifact(job.id, {
                fileType: 'ENCRYPTED-CODE-RUN-LOG',
                files: [{ name: 'run.log', content: 'boom' }],
            }),
        ])
    })

    it('titles the card with the date the run finished', async () => {
        renderWithProviders(<CodeRunKeyForm job={job} description={DESCRIPTION} onDecrypted={onDecrypted} />)

        expect(await screen.findByRole('heading', { name: 'Code run • Mar 05, 2026' })).toBeInTheDocument()
        expect(screen.queryByRole('heading', { name: /security key/i })).not.toBeInTheDocument()
    })

    it('shows the output files title, required key label and caller copy instead of the sign-up copy', async () => {
        renderWithProviders(<CodeRunKeyForm job={job} description={DESCRIPTION} onDecrypted={onDecrypted} />)

        await screen.findByRole('button', { name: 'View files' })
        expect(screen.getByText('Output files')).toBeInTheDocument()
        expect(screen.getByText(/^Security key/)).toContainElement(screen.getByLabelText('required'))
        expect(screen.getByText(DESCRIPTION)).toBeInTheDocument()
        expect(screen.queryByText(/It was issued to you during sign-up/)).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'View' })).not.toBeInTheDocument()
    })

    it('falls back to a dash when the run has no finish time', async () => {
        renderWithProviders(
            <CodeRunKeyForm job={{ ...job, statusChanges: [] }} description={DESCRIPTION} onDecrypted={onDecrypted} />,
        )

        expect(await screen.findByRole('heading', { name: 'Code run • —' })).toBeInTheDocument()
    })

    it('keeps the empty-key error from the shared key form', async () => {
        renderWithProviders(<CodeRunKeyForm job={job} description={DESCRIPTION} onDecrypted={onDecrypted} />)

        fireEvent.click(await screen.findByRole('button', { name: 'View files' }))

        expect(await screen.findByText('Enter your security key to decrypt the outputs.')).toBeInTheDocument()
        expect(onDecrypted).not.toHaveBeenCalled()
    })

    it('hands the decrypted files to the caller on a valid key', async () => {
        renderWithProviders(<CodeRunKeyForm job={job} description={DESCRIPTION} onDecrypted={onDecrypted} />)

        await screen.findByRole('button', { name: 'View files' })
        fireEvent.change(screen.getByRole('textbox'), {
            target: { value: await readTestSupportFile('private_key.pem') },
        })
        fireEvent.click(screen.getByRole('button', { name: 'View files' }))

        await waitFor(() => expect(onDecrypted).toHaveBeenCalledOnce())
        expect(onDecrypted.mock.calls[0][0]).toEqual([expect.objectContaining({ path: 'run.log' })])
    })
})
