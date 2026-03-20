import {
    afterEach,
    beforeEach,
    cleanupWorkspaceDirs,
    createWorkspaceDir,
    describe,
    expect,
    insertTestStudyOnly,
    it,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
    writeWorkspaceFiles,
} from '@/tests/unit.helpers'
import { StudyRequestProvider } from '@/contexts/study-request'
import { CodeUploadPage } from './code-upload'
import type { Route } from 'next'
import { vi } from 'vitest'

const launchWorkspace = vi.fn()

vi.mock('@/server/aws', async () => {
    const actual = await vi.importActual('@/server/aws')
    return {
        ...actual,
        storeS3File: vi.fn(),
        triggerScanForStudyJob: vi.fn(),
    }
})

vi.mock('@/hooks/use-workspace-launcher', () => ({
    useWorkspaceLauncher: (props: { studyId: string; onSuccess?: () => void }) => ({
        launchWorkspace: () => {
            launchWorkspace(props.studyId)
            props.onSuccess?.()
        },
        isLaunching: false,
        isCreatingWorkspace: false,
        error: null,
        clearError: vi.fn(),
    }),
}))

const workspaceRoots: string[] = []

const renderPage = async (orgSlug = 'openstax') => {
    const { org, user } = await mockSessionWithTestData({ orgSlug, orgType: 'lab' })
    const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

    renderWithProviders(
        <StudyRequestProvider submittingOrgSlug={orgSlug}>
            <CodeUploadPage studyId={study.id} orgSlug={orgSlug} language="R" previousHref={'/test' as Route} />
        </StudyRequestProvider>,
    )

    return { study }
}

describe('CodeUploadPage', () => {
    beforeEach(() => {
        delete process.env.CODER_FILES
    })

    afterEach(async () => {
        await cleanupWorkspaceDirs(workspaceRoots)
    })

    it('transitions from upload view to inline IDE review after clicking Launch IDE', async () => {
        const { study } = await renderPage()
        const root = await createWorkspaceDir('code-upload-page')
        workspaceRoots.push(root)
        await writeWorkspaceFiles(root, study.id, {
            'main.r': 'print("main")',
            'helper.r': 'print("helper")',
        })

        const user = userEvent.setup()
        expect(screen.getByText('STEP 4 of 4')).toBeInTheDocument()
        expect(screen.getByText('Study code')).toBeInTheDocument()

        await user.click(await screen.findByRole('button', { name: /launch ide/i }))

        await waitFor(() => {
            expect(launchWorkspace).toHaveBeenCalledWith(study.id)
            expect(screen.getByText('Review files from IDE')).toBeInTheDocument()
            expect(screen.getByText('main.r')).toBeInTheDocument()
        })
    })

    it('returns from IDE review to upload view when Back to upload is clicked', async () => {
        const { study } = await renderPage()
        const root = await createWorkspaceDir('code-upload-page')
        workspaceRoots.push(root)
        await writeWorkspaceFiles(root, study.id, {
            'main.r': 'print("main")',
        })

        const user = userEvent.setup()
        await user.click(await screen.findByRole('button', { name: /launch ide/i }))

        await waitFor(() => {
            expect(screen.getByText('Review files from IDE')).toBeInTheDocument()
        })

        await user.click(screen.getByRole('button', { name: /back to upload/i }))

        await waitFor(() => {
            expect(screen.queryByText('Review files from IDE')).not.toBeInTheDocument()
            expect(screen.getByRole('button', { name: /launch ide/i })).toBeInTheDocument()
        })
    })

    it('hides the Launch IDE button for non-OpenStax orgs', async () => {
        await renderPage('some-other-org')

        expect(screen.getByText('STEP 4 of 4')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /launch ide/i })).not.toBeInTheDocument()
    })
})
