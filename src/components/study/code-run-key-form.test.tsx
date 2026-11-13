import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import {
    insertTestJobStatus,
    fireEvent,
    hydrateServerHtml,
    insertTestStudyJobData,
    mockSessionWithTestData,
    readTestSupportFile,
    renderWithProviders,
    screen,
    waitFor,
} from '@/tests/unit.helpers'
import { latestJobForStudy, type LatestJobForStudy } from '@/server/db/queries'
import { seedEncryptedArtifact } from '@/tests/artifact.helpers'
import { EMPTY_CELL } from '@/lib/dates'
import { CodeRunKeyForm } from './code-run-key-form'

const DESCRIPTION =
    'Output files are encrypted. Enter your security key to access outputs from this and previous code runs.'

describe('CodeRunKeyForm', () => {
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

    it('titles the card with the date the run finished', async () => {
        renderWithProviders(<CodeRunKeyForm job={job} description={DESCRIPTION} onDecrypted={onDecrypted} />)

        expect(await screen.findByRole('heading', { name: 'Code run Mar 05, 2026' })).toBeInTheDocument()
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

    // Tests run in America/Chicago, where a run ending after UTC midnight is still the day before.
    it('hydrates without a mismatch when the run ended after UTC midnight', async () => {
        const lateRun = {
            ...job,
            statusChanges: [{ status: 'JOB-ERRORED' as const, createdAt: '2026-09-24T01:30:00Z' }],
        }
        const { recoverableErrors } = hydrateServerHtml(
            <CodeRunKeyForm job={lateRun} description={DESCRIPTION} onDecrypted={onDecrypted} />,
        )

        expect(await screen.findByRole('heading', { name: 'Code run Sep 23, 2026' })).toBeInTheDocument()
        expect(recoverableErrors).toEqual([])
    })

    it('falls back to a dash, read as an unknown date, when the run has no finish time', async () => {
        renderWithProviders(
            <CodeRunKeyForm job={{ ...job, statusChanges: [] }} description={DESCRIPTION} onDecrypted={onDecrypted} />,
        )

        const heading = await screen.findByRole('heading', { name: 'Code run date unknown' })
        expect(heading).toHaveTextContent(`Code run • ${EMPTY_CELL}`)
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
