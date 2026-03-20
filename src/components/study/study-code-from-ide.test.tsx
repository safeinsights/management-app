import {
    afterEach,
    beforeEach,
    cleanupWorkspaceDirs,
    createWorkspaceDir,
    db,
    describe,
    expect,
    expectStudyJobRecords,
    it,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
    writeWorkspaceFiles,
} from '@/tests/unit.helpers'
import { StudyRequestProvider } from '@/contexts/study-request'
import { StudyCodeFromIDE } from './study-code-from-ide'
import { notifications } from '@mantine/notifications'
import type { Route } from 'next'
import { vi } from 'vitest'

vi.mock('@/server/aws', async () => {
    const actual = await vi.importActual('@/server/aws')
    return {
        ...actual,
        storeS3File: vi.fn(),
        triggerScanForStudyJob: vi.fn(),
    }
})

const workspaceRoots: string[] = []

const setupStudy = async (orgSlug = 'openstax-lab') => {
    const { org, user } = await mockSessionWithTestData({ orgSlug, orgType: 'lab' })
    const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
    return { org, user, study }
}

const renderIDE = async (studyOrgSlug = 'openstax-lab', files?: Record<string, string>) => {
    const { study } = await setupStudy(studyOrgSlug)
    if (files) {
        const root = await createWorkspaceDir('study-code-from-ide')
        workspaceRoots.push(root)
        await writeWorkspaceFiles(root, study.id, files)
    }
    const previousHref = `/test-org/study/${study.id}/agreements` as Route

    renderWithProviders(
        <StudyRequestProvider submittingOrgSlug={studyOrgSlug} initialStudyId={study.id}>
            <StudyCodeFromIDE studyId={study.id} studyOrgSlug={studyOrgSlug} previousHref={previousHref} />
        </StudyRequestProvider>,
    )

    return { study, previousHref }
}

describe('StudyCodeFromIDE', () => {
    beforeEach(() => {
        delete process.env.CODER_FILES
    })

    afterEach(async () => {
        await cleanupWorkspaceDirs(workspaceRoots)
    })

    it('renders the empty state when the workspace has no files', async () => {
        await renderIDE()

        await waitFor(() => {
            expect(screen.getByText('Review files from IDE')).toBeInTheDocument()
            expect(screen.getByText('No files found in workspace.')).toBeInTheDocument()
            expect(screen.getByRole('button', { name: /submit code/i })).toBeDisabled()
        })
    })

    it('renders workspace files and selects the suggested main file', async () => {
        await renderIDE('openstax-lab', {
            'main.r': 'print("main")',
            'helper.r': 'print("helper")',
        })

        await waitFor(() => {
            expect(screen.getByText('main.r')).toBeInTheDocument()
            expect(screen.getByText('helper.r')).toBeInTheDocument()
        })

        expect(screen.getByText('Main file')).toBeInTheDocument()
        expect(screen.getByText('File name')).toBeInTheDocument()

        const radios = screen.getAllByRole('radio')
        expect(radios).toHaveLength(2)
        expect(screen.getByDisplayValue('main.r')).toBeChecked()
        expect(screen.getByDisplayValue('helper.r')).not.toBeChecked()
        expect(screen.getByRole('button', { name: /submit code/i })).toBeEnabled()
    })

    it('updates the selected main file', async () => {
        const user = userEvent.setup()
        await renderIDE('openstax-lab', {
            'main.r': 'print("main")',
            'helper.r': 'print("helper")',
        })

        await waitFor(() => {
            expect(screen.getByText('helper.r')).toBeInTheDocument()
        })

        const radios = screen.getAllByRole('radio')
        await user.click(radios[1])
        expect(radios[1]).toBeChecked()
        expect(screen.getByRole('button', { name: /submit code/i })).toBeEnabled()
    })

    it('shows the Launch IDE button for OpenStax orgs only', async () => {
        await renderIDE('openstax')

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /launch ide/i })).toBeInTheDocument()
        })
    })

    it('hides the Launch IDE button for non-OpenStax orgs', async () => {
        await renderIDE('some-other-org')

        await waitFor(() => {
            expect(screen.getByText('Review files from IDE')).toBeInTheDocument()
        })

        expect(screen.queryByRole('button', { name: /launch ide/i })).not.toBeInTheDocument()
    })

    it('submits IDE files and persists study job records', async () => {
        const user = userEvent.setup()
        const { study } = await renderIDE('openstax-lab', {
            'main.R': 'print("main")',
            'helper.R': 'print("helper")',
        })

        await waitFor(() => {
            expect(screen.getByText('main.R')).toBeInTheDocument()
        })

        await user.click(screen.getByRole('button', { name: /submit code/i }))

        await waitFor(async () => {
            const updated = await db
                .selectFrom('study')
                .select(['status'])
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(updated.status).toBe('PENDING-REVIEW')
        })

        await expectStudyJobRecords(study.id, [
            { name: 'main.R', fileType: 'MAIN-CODE' },
            { name: 'helper.R', fileType: 'SUPPLEMENTAL-CODE' },
        ])

        expect(notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({ color: 'green', title: 'Study Code Submitted' }),
        )
    })

    it('renders the page chrome and previous link', async () => {
        const { previousHref } = await renderIDE()

        await waitFor(() => {
            expect(screen.getByText('STEP 4 of 4')).toBeInTheDocument()
            expect(screen.getByText('Study code')).toBeInTheDocument()
        })

        const previousLink = screen.getByRole('link', { name: /previous/i })
        expect(previousLink).toHaveAttribute('href', previousHref)
        expect(screen.getByRole('button', { name: /back to upload/i })).toBeInTheDocument()
    })
})
