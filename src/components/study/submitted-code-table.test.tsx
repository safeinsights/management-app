import { describe, it, expect, vi } from 'vitest'
import {
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    storeTestCodeFile,
    userEvent,
    waitFor,
} from '@/tests/unit.helpers'
import { latestJobForStudy, type LatestJobForStudy } from '@/server/db/queries'
import { SubmittedCodeTable } from './submitted-code-table'

const buildFile = (overrides: Partial<LatestJobForStudy['files'][number]>): LatestJobForStudy['files'][number] => ({
    id: 'file-1',
    name: 'main.py',
    path: 'code/main.py',
    fileType: 'MAIN-CODE',
    createdAt: '2026-01-01T12:00:00Z',
    ...overrides,
})

const setupJobWithFiles = async (files: Parameters<typeof storeTestCodeFile>[1][]) => {
    const { org } = await mockSessionWithTestData({ orgType: 'enclave' })
    const { study, job } = await insertTestStudyJobData({ org })
    for (const file of files) await storeTestCodeFile(job.id, file)
    return latestJobForStudy(study.id)
}

describe('SubmittedCodeTable', () => {
    it('opens the preview modal with a loader while contents are fetching, then renders the code', async () => {
        const job = await setupJobWithFiles([{ name: 'main.py', contents: 'print("hi")' }])
        renderWithProviders(
            <SubmittedCodeTable activityByName={{}} jobId={job.id} dataPartnerName="OpenStax" files={job.files} />,
        )

        const interact = userEvent.setup()
        await interact.click(screen.getByRole('button', { name: 'View main.py' }))

        expect(await screen.findByTestId('file-preview-loading')).toBeInTheDocument()

        await waitFor(() => {
            expect(screen.queryByTestId('file-preview-loading')).not.toBeInTheDocument()
        })
        expect(screen.getByText(/print/)).toBeInTheDocument()
    })

    it('downloads each file through the /dl/study-code route', async () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        const files = [
            buildFile({ name: 'main.py', fileType: 'MAIN-CODE' }),
            buildFile({ name: 'helper.py', fileType: 'SUPPLEMENTAL-CODE' }),
        ]
        renderWithProviders(
            <SubmittedCodeTable activityByName={{}} jobId="job-1" files={files} dataPartnerName="OpenStax" />,
        )

        const user = userEvent.setup()
        await user.click(screen.getByRole('button', { name: 'Download main.py' }))
        await user.click(screen.getByRole('button', { name: 'Download helper.py' }))

        expect(open).toHaveBeenCalledWith('/dl/study-code/job-1/main.py')
        expect(open).toHaveBeenCalledWith('/dl/study-code/job-1/helper.py')
    })

    it('opens an image preview for a png file (OTTER-516)', async () => {
        const job = await setupJobWithFiles([
            { name: 'plot.png', contents: 'fake-png-bytes', fileType: 'SUPPLEMENTAL-CODE' },
        ])
        renderWithProviders(
            <SubmittedCodeTable activityByName={{}} jobId={job.id} dataPartnerName="OpenStax" files={job.files} />,
        )

        const interact = userEvent.setup()
        await interact.click(screen.getByRole('button', { name: 'View plot.png' }))

        expect(await screen.findByAltText('plot.png')).toBeInTheDocument()
    })

    it('closes the modal when onClose is fired', async () => {
        const job = await setupJobWithFiles([{ name: 'main.py', contents: 'x = 1' }])
        renderWithProviders(
            <SubmittedCodeTable activityByName={{}} jobId={job.id} dataPartnerName="OpenStax" files={job.files} />,
        )

        const interact = userEvent.setup()
        await interact.click(screen.getByRole('button', { name: 'View main.py' }))

        const dialog = await screen.findByRole('dialog')
        await interact.click(dialog.querySelector('button.mantine-Modal-close') as HTMLElement)

        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        })
    })
})
