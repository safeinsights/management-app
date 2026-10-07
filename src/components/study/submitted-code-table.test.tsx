import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import {
    BLANK_UUID,
    db,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
} from '@/tests/unit.helpers'
import type { LatestJobForStudy } from '@/server/db/queries'
import { SubmittedCodeTable } from './submitted-code-table'

vi.mock('@/server/actions/study-job.actions', () => ({
    fetchStudyJobCodeFileAction: vi.fn(),
}))

vi.mock('@/components/spy-mode-context', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/components/spy-mode-context')>()),
    useSpyMode: () => ({ isSpyMode: false }),
}))

vi.mock('@/hooks/session', () => ({
    useSession: () => ({ isLoaded: true, session: { orgs: {} } }),
}))

import { fetchStudyJobCodeFileAction } from '@/server/actions/study-job.actions'

const mockFetch = fetchStudyJobCodeFileAction as unknown as Mock

const buildFile = (overrides: Partial<LatestJobForStudy['files'][number]>): LatestJobForStudy['files'][number] => ({
    id: 'file-1',
    name: 'main.py',
    path: 'code/main.py',
    fileType: 'MAIN-CODE',
    createdAt: '2026-01-01T12:00:00Z',
    ...overrides,
})

const bytes = (text: string) => new TextEncoder().encode(text).buffer

describe('SubmittedCodeTable', () => {
    beforeEach(() => {
        mockFetch.mockReset()
    })

    it('opens the preview modal with a loader while contents are fetching, then renders the code', async () => {
        let resolveFetch: (v: { fileName: string; contents: ArrayBuffer }) => void = () => {}
        mockFetch.mockReturnValue(
            new Promise((resolve) => {
                resolveFetch = resolve
            }),
        )

        const files = [buildFile({ name: 'main.py' })]
        renderWithProviders(<SubmittedCodeTable studyId={BLANK_UUID} jobId="job-1" files={files} />)

        const interact = userEvent.setup()
        await interact.click(screen.getByRole('button', { name: 'View main.py' }))

        expect(await screen.findByTestId('file-preview-loading')).toBeInTheDocument()

        resolveFetch({ fileName: 'main.py', contents: bytes('print("hi")') })

        await waitFor(() => {
            expect(screen.queryByTestId('file-preview-loading')).not.toBeInTheDocument()
        })
        expect(screen.getByText(/print/)).toBeInTheDocument()
    })

    it('renders a download anchor per row pointing at the /dl/study-code route', () => {
        const files = [
            buildFile({ name: 'main.py', fileType: 'MAIN-CODE' }),
            buildFile({ name: 'helper.py', fileType: 'SUPPLEMENTAL-CODE' }),
        ]
        renderWithProviders(<SubmittedCodeTable studyId={BLANK_UUID} jobId="job-1" files={files} />)

        const main = screen.getByRole('link', { name: 'Download main.py' })
        expect(main).toHaveAttribute('href', '/dl/study-code/job-1/main.py')
        expect(main).toHaveAttribute('download', 'main.py')

        const helper = screen.getByRole('link', { name: 'Download helper.py' })
        expect(helper).toHaveAttribute('href', '/dl/study-code/job-1/helper.py')
    })

    it('opens an image preview for a png file (OTTER-516)', async () => {
        mockFetch.mockResolvedValue({ fileName: 'plot.png', contents: bytes('fake-png-bytes') })

        const files = [buildFile({ name: 'plot.png', fileType: 'SUPPLEMENTAL-CODE' })]
        renderWithProviders(<SubmittedCodeTable studyId={BLANK_UUID} jobId="job-1" files={files} />)

        const interact = userEvent.setup()
        await interact.click(screen.getByRole('button', { name: 'View plot.png' }))

        expect(await screen.findByAltText('plot.png')).toBeInTheDocument()
    })

    it('closes the modal when onClose is fired', async () => {
        mockFetch.mockResolvedValue({ fileName: 'main.py', contents: bytes('x = 1') })

        renderWithProviders(
            <SubmittedCodeTable studyId={BLANK_UUID} jobId="job-1" files={[buildFile({ name: 'main.py' })]} />,
        )

        const interact = userEvent.setup()
        await interact.click(screen.getByRole('button', { name: 'View main.py' }))

        const dialog = await screen.findByRole('dialog')
        await interact.click(dialog.querySelector('button.mantine-Modal-close') as HTMLElement)

        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        })
    })

    it('shows the main file info, and edit and delete disabled (OTTER-778)', () => {
        renderWithProviders(
            <SubmittedCodeTable studyId={BLANK_UUID} jobId="job-1" files={[buildFile({ name: 'main.py' })]} />,
        )

        expect(screen.getByLabelText('Main file info')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Edit main.py in IDE' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Delete main.py' })).toBeDisabled()
    })

    it('shows the last activity recorded while the code was edited (OTTER-778)', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax-lab', orgType: 'lab' })
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        await db
            .insertInto('workspaceFileActivity')
            .values({
                studyId: study.id,
                fileName: 'main.py',
                action: 'EDITED_IN_IDE',
                userId: user.id,
                createdAt: new Date('2026-07-21T16:10:00Z'),
            })
            .execute()

        const files = [
            buildFile({ name: 'main.py' }),
            buildFile({ id: 'file-2', name: 'helper.py', fileType: 'SUPPLEMENTAL-CODE' }),
        ]
        renderWithProviders(<SubmittedCodeTable studyId={study.id} jobId="job-1" files={files} />)

        expect(
            await screen.findByText(new RegExp(`${user.fullName} · Edited in IDE · Jul 21, 2026,`)),
        ).toBeInTheDocument()
        expect(screen.getByText('No activity yet')).toBeInTheDocument()
    })
})
