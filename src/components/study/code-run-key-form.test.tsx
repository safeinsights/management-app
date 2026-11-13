import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import {
    insertTestJobStatus,
    fireEvent,
    insertTestStudyJobData,
    mockSessionWithTestData,
    readTestSupportFile,
    renderWithProviders,
    screen,
    waitFor,
} from '@/tests/unit.helpers'
import { latestJobForStudy, type LatestJobForStudy } from '@/server/db/queries'
import { seedEncryptedArtifact } from '@/tests/artifact.helpers'
import { CodeRunKeyFields } from './code-run-key-form'

const DESCRIPTION =
    'Output files are encrypted. Enter your security key to access outputs from this and previous code runs.'

describe('CodeRunKeyFields', () => {
    let job: NonNullable<LatestJobForStudy>
    let onDecrypted: Mock

    beforeEach(async () => {
        const { org } = await mockSessionWithTestData()
        const { study, job: dbJob } = await insertTestStudyJobData({ org, jobStatus: 'INITIATED' })
        await insertTestJobStatus(dbJob.id, 'JOB-ERRORED', { at: new Date('2026-03-05T12:00:00Z') })
        job = (await latestJobForStudy(study.id))!
        onDecrypted = vi.fn()

        await seedEncryptedArtifact(job.id, {
            fileType: 'ENCRYPTED-CODE-RUN-LOG',
            files: [{ name: 'run.log', content: 'boom' }],
        })
    })

    it('shows the output files title, required key label and caller copy instead of the sign-up copy', async () => {
        renderWithProviders(<CodeRunKeyFields job={job} description={DESCRIPTION} onDecrypted={onDecrypted} />)

        await screen.findByRole('button', { name: 'View files' })
        expect(screen.getByText('Output files')).toBeInTheDocument()
        expect(screen.getByText(/^Security key/)).toContainElement(screen.getByLabelText('required'))
        expect(screen.getByText(DESCRIPTION)).toBeInTheDocument()
        expect(screen.queryByRole('heading', { name: /security key/i })).not.toBeInTheDocument()
        expect(screen.queryByText(/It was issued to you during sign-up/)).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'View' })).not.toBeInTheDocument()
    })

    it('keeps the empty-key error from the shared key form', async () => {
        renderWithProviders(<CodeRunKeyFields job={job} description={DESCRIPTION} onDecrypted={onDecrypted} />)

        fireEvent.click(await screen.findByRole('button', { name: 'View files' }))

        expect(await screen.findByText('Enter your security key to decrypt the outputs.')).toBeInTheDocument()
        expect(onDecrypted).not.toHaveBeenCalled()
    })

    it('hands the decrypted files to the caller on a valid key', async () => {
        renderWithProviders(<CodeRunKeyFields job={job} description={DESCRIPTION} onDecrypted={onDecrypted} />)

        await screen.findByRole('button', { name: 'View files' })
        fireEvent.change(screen.getByRole('textbox'), {
            target: { value: await readTestSupportFile('private_key.pem') },
        })
        fireEvent.click(screen.getByRole('button', { name: 'View files' }))

        await waitFor(() => expect(onDecrypted).toHaveBeenCalledOnce())
        expect(onDecrypted.mock.calls[0][0]).toEqual([expect.objectContaining({ path: 'run.log' })])
    })
})
