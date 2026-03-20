import { useEffect } from 'react'
import {
    afterEach,
    beforeEach,
    cleanupWorkspaceDirs,
    createWorkspaceDir,
    db,
    describe,
    expect,
    expectStudyJobRecords,
    insertTestStudyOnly,
    it,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
    writeWorkspaceFiles,
} from '@/tests/unit.helpers'
import { StudyRequestProvider, useStudyRequest } from '@/contexts/study-request'
import { notifications } from '@mantine/notifications'
import { storeS3File } from '@/server/aws'
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

// Mock the launcher hook here so this test stays focused on CodeUploadPage view transitions.
// The real hook adds window.open plus polling/timing behavior that is slower, more brittle in jsdom, and covered in use-workspace-launcher.test.tsx.
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

interface RenderPageOptions {
    orgSlug?: string
    existingMainFile?: string
    existingAdditionalFiles?: string[]
    seedReviewMode?: boolean
}

function ReviewModeSeeder({ mainFile, additionalFiles }: { mainFile: string; additionalFiles: string[] }) {
    const { setExistingFiles, setCodeUploadViewMode } = useStudyRequest()

    useEffect(() => {
        setExistingFiles(mainFile, [mainFile, ...additionalFiles])
        setCodeUploadViewMode('review')
    }, [mainFile, additionalFiles, setExistingFiles, setCodeUploadViewMode])

    return null
}

const renderPage = async ({
    orgSlug = 'openstax',
    existingMainFile,
    existingAdditionalFiles,
    seedReviewMode,
}: RenderPageOptions = {}) => {
    const { org, user } = await mockSessionWithTestData({ orgSlug, orgType: 'lab' })
    const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

    renderWithProviders(
        <StudyRequestProvider submittingOrgSlug={orgSlug} initialStudyId={study.id}>
            <CodeUploadPage
                studyId={study.id}
                orgSlug={orgSlug}
                language="R"
                previousHref={'/test' as Route}
                existingMainFile={existingMainFile}
                existingAdditionalFiles={existingAdditionalFiles}
            />
            {seedReviewMode && existingMainFile && (
                <ReviewModeSeeder mainFile={existingMainFile} additionalFiles={existingAdditionalFiles ?? []} />
            )}
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
        await renderPage({ orgSlug: 'some-other-org' })

        expect(screen.getByText('STEP 4 of 4')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /launch ide/i })).not.toBeInTheDocument()
    })

    // --- Integration tests ---

    it('submits IDE files through full page flow and persists study job records', async () => {
        const { study } = await renderPage()
        const root = await createWorkspaceDir('code-upload-page')
        workspaceRoots.push(root)
        await writeWorkspaceFiles(root, study.id, {
            'main.R': 'print("main")',
            'helper.R': 'print("helper")',
        })

        const user = userEvent.setup()
        await user.click(await screen.findByRole('button', { name: /launch ide/i }))

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

    it('shows error notification when IDE file upload to S3 fails', async () => {
        vi.mocked(storeS3File).mockRejectedValueOnce(new Error('S3 upload failed'))

        const { study } = await renderPage()
        const root = await createWorkspaceDir('code-upload-page')
        workspaceRoots.push(root)
        await writeWorkspaceFiles(root, study.id, {
            'main.R': 'print("main")',
        })

        const user = userEvent.setup()
        await user.click(await screen.findByRole('button', { name: /launch ide/i }))

        await waitFor(() => {
            expect(screen.getByText('main.R')).toBeInTheDocument()
        })

        await user.click(screen.getByRole('button', { name: /submit code/i }))

        await waitFor(() => {
            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({ color: 'red', title: 'Unable to Submit Study' }),
            )
        })

        // Status stays at its original value (APPROVED) because the IDE action
        // updates to PENDING-REVIEW only after storeS3File succeeds
        const updated = await db
            .selectFrom('study')
            .select(['status'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updated.status).not.toBe('PENDING-REVIEW')
    })

    it('submits existing files and persists study job records', async () => {
        const { study } = await renderPage({
            existingMainFile: 'analysis.R',
            existingAdditionalFiles: ['utils.R'],
        })

        const user = userEvent.setup()

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /submit code/i })).toBeEnabled()
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
            { name: 'analysis.R', fileType: 'MAIN-CODE' },
            { name: 'utils.R', fileType: 'SUPPLEMENTAL-CODE' },
        ])

        expect(notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({ color: 'green', title: 'Study Code Submitted' }),
        )
    })

    // --- Branch coverage tests ---

    it('enables submit when existing files are present', async () => {
        await renderPage({
            existingMainFile: 'analysis.R',
        })

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /submit code/i })).toBeEnabled()
        })
    })

    it('keeps submit disabled when there are no existing or selected files', async () => {
        await renderPage()

        expect(screen.getByRole('button', { name: /submit code/i })).toBeDisabled()
    })

    it('renders review mode when code files are already selected', async () => {
        await renderPage({
            existingMainFile: 'analysis.R',
            existingAdditionalFiles: ['utils.R'],
            seedReviewMode: true,
        })

        await waitFor(() => {
            expect(screen.getByText('Review uploaded files')).toBeInTheDocument()
            expect(screen.getByText('analysis.R')).toBeInTheDocument()
            expect(screen.getByText('utils.R')).toBeInTheDocument()
        })

        expect(screen.getByRole('button', { name: /submit code/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /back to upload/i })).toBeInTheDocument()
    })

    it('returns from review mode to upload mode when Back to upload is clicked', async () => {
        await renderPage({
            existingMainFile: 'analysis.R',
            seedReviewMode: true,
        })

        await waitFor(() => {
            expect(screen.getByText('Review uploaded files')).toBeInTheDocument()
        })

        const user = userEvent.setup()
        await user.click(screen.getByRole('button', { name: /back to upload/i }))

        await waitFor(() => {
            expect(screen.getByText('STEP 4 of 4')).toBeInTheDocument()
            expect(screen.getByText('Study code')).toBeInTheDocument()
        })
    })
})
