import {
    afterEach,
    beforeEach,
    cleanupWorkspaceDirs,
    createWorkspaceDir,
    db,
    describe,
    expect,
    expectStudyJobRecords,
    insertTestBaselineJob,
    insertTestStudyOnly,
    it,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
    within,
    writeWorkspaceFiles,
} from '@/tests/unit.helpers'
import { notifications } from '@mantine/notifications'
import { storeS3File } from '@/server/aws'
import { memoryRouter } from 'next-router-mock'
import { CodeUploadPage } from './code-upload'
import type { Route } from 'next'
import { vi } from 'vitest'
import { s3Available } from '@/tests/s3.helpers'

vi.mock('@/server/aws', async () => {
    const actual = await vi.importActual('@/server/aws')
    return {
        ...actual,
        storeS3File: vi.fn(),
        triggerScanForStudyJob: vi.fn(),
        createSignedUploadUrl: vi.fn().mockResolvedValue('https://mock-s3-url.example.com'),
    }
})

const workspaceRoots: string[] = []

const setupStudy = async (orgSlug = 'openstax') => {
    const { org, user } = await mockSessionWithTestData({ orgSlug, orgType: 'lab' })
    const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
    return { study }
}

const renderPage = async (orgSlug = 'openstax') => {
    const { study } = await setupStudy(orgSlug)
    renderWithProviders(
        <CodeUploadPage
            orgSlug={orgSlug}
            studyId={study.id}
            studyTitle={study.title}
            previousHref={'/test' as Route}
        />,
    )
    return { study }
}

const confirmStudyCodeSubmission = async (user: ReturnType<typeof userEvent.setup>) => {
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Yes, submit study code' }))
}

describe('CodeUploadPage', () => {
    beforeEach(() => {
        delete process.env.CODER_FILES
        memoryRouter.setCurrentUrl('/')
    })

    afterEach(async () => {
        await cleanupWorkspaceDirs(workspaceRoots)
    })

    it('renders the page chrome in the empty state', async () => {
        await renderPage()

        await waitFor(() => {
            expect(screen.getByText('STEP 4 of 4')).toBeInTheDocument()
            expect(screen.getByText('Study code')).toBeInTheDocument()
            expect(screen.getByText(/write and test your code in ide/i)).toBeInTheDocument()
            expect(screen.getByRole('button', { name: /launch ide/i })).toBeInTheDocument()
        })
    })

    it('shows the Launch IDE button for all orgs', async () => {
        await renderPage('some-other-org')

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /launch ide/i })).toBeInTheDocument()
        })
    })

    it('shows empty state when no files exist', async () => {
        await renderPage()

        await waitFor(() => {
            expect(screen.getByText(/upload your files/i)).toBeInTheDocument()
            expect(screen.getByRole('button', { name: /submit code/i })).toBeDisabled()
        })
    })

    // Submitting reuses the open round job, whose cleanup hits real S3
    // (deleteFolderContents) — skip when SeaweedFS isn't running locally; CI has it.
    it.skipIf(!s3Available)('shows workspace files and allows submission', async () => {
        const { study } = await setupStudy()
        await insertTestBaselineJob(study.id, { createdAt: new Date(Date.now() - 1000) })
        const root = await createWorkspaceDir('code-upload-page')
        workspaceRoots.push(root)
        await writeWorkspaceFiles(root, study.id, {
            'main.r': 'print("main")',
            'helper.r': 'print("helper")',
        })

        renderWithProviders(
            <CodeUploadPage
                orgSlug="openstax"
                studyId={study.id}
                studyTitle={study.title}
                previousHref={'/test' as Route}
            />,
        )

        await waitFor(() => {
            expect(screen.getAllByText('main.r').length).toBeGreaterThan(0)
            expect(screen.getByText('helper.r')).toBeInTheDocument()
            // main.r auto-selects as the main file
            expect(screen.getByRole('button', { name: /main\.r is the main file/i })).toHaveAttribute(
                'aria-pressed',
                'true',
            )
            expect(screen.getByRole('button', { name: /submit code/i })).toBeEnabled()
        })

        const user = userEvent.setup()
        await user.click(screen.getByRole('button', { name: /submit code/i }))
        await confirmStudyCodeSubmission(user)

        await waitFor(async () => {
            const updated = await db
                .selectFrom('study')
                .select(['status'])
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(updated.status).toBe('PENDING-REVIEW')
        })

        await expectStudyJobRecords(study.id, [
            { name: 'main.r', fileType: 'MAIN-CODE' },
            { name: 'helper.r', fileType: 'SUPPLEMENTAL-CODE' },
        ])
    })

    it.skipIf(!s3Available)('routes to /{orgSlug}/study/{studyId}/view after successful submit', async () => {
        const orgSlug = 'openstax'
        const { study } = await setupStudy(orgSlug)
        await insertTestBaselineJob(study.id, { createdAt: new Date(Date.now() - 1000) })
        const root = await createWorkspaceDir('code-upload-page')
        workspaceRoots.push(root)
        await writeWorkspaceFiles(root, study.id, {
            'main.r': 'print("main")',
        })

        renderWithProviders(
            <CodeUploadPage
                orgSlug={orgSlug}
                studyId={study.id}
                studyTitle={study.title}
                previousHref={'/test' as Route}
            />,
        )

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /submit code/i })).toBeEnabled()
        })

        const user = userEvent.setup()
        await user.click(screen.getByRole('button', { name: /submit code/i }))
        await confirmStudyCodeSubmission(user)

        await waitFor(async () => {
            const updated = await db
                .selectFrom('study')
                .select(['status'])
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(updated.status).toBe('PENDING-REVIEW')
        })

        await waitFor(() => {
            expect(memoryRouter.asPath).toBe(`/openstax/study/${study.id}/view`)
        })
    })

    it('shows error notification when IDE file upload to S3 fails', async () => {
        vi.mocked(storeS3File).mockRejectedValueOnce(new Error('S3 upload failed'))

        const { study } = await setupStudy()
        await insertTestBaselineJob(study.id, { createdAt: new Date(Date.now() - 1000) })
        const root = await createWorkspaceDir('code-upload-page')
        workspaceRoots.push(root)
        await writeWorkspaceFiles(root, study.id, {
            'main.R': 'print("main")',
        })

        renderWithProviders(
            <CodeUploadPage
                orgSlug="openstax"
                studyId={study.id}
                studyTitle={study.title}
                previousHref={'/test' as Route}
            />,
        )

        await waitFor(() => {
            expect(screen.getAllByText('main.R').length).toBeGreaterThan(0)
            expect(screen.getByRole('button', { name: /submit code/i })).toBeEnabled()
        })

        const user = userEvent.setup()
        await user.click(screen.getByRole('button', { name: /submit code/i }))
        await confirmStudyCodeSubmission(user)

        await waitFor(() => {
            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({ color: 'red', title: 'Unable to submit study' }),
            )
        })

        const updated = await db
            .selectFrom('study')
            .select(['status'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(updated.status).not.toBe('PENDING-REVIEW')
    })
})
