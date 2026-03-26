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
            <StudyCodeFromIDE
                studyId={study.id}
                studyOrgSlug={studyOrgSlug}
                previousHref={previousHref}
                onGoBack={vi.fn()}
            />
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

    it('removes the suggested main file and submits with fallback main', async () => {
        const user = userEvent.setup()
        const { study } = await renderIDE('openstax-lab', {
            'main.r': 'print("main")',
            'helper.r': 'print("helper")',
            'utils.r': 'print("utils")',
        })

        await waitFor(() => {
            expect(screen.getByText('main.r')).toBeInTheDocument()
        })

        expect(screen.getByDisplayValue('main.r')).toBeChecked()

        await user.click(screen.getByRole('button', { name: 'Remove main.r' }))

        await waitFor(() => {
            expect(screen.queryByText('main.r')).not.toBeInTheDocument()
        })

        expect(screen.getByDisplayValue('helper.r')).toBeChecked()

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
            { name: 'helper.r', fileType: 'MAIN-CODE' },
            { name: 'utils.r', fileType: 'SUPPLEMENTAL-CODE' },
        ])
    })

    it('removes a supplemental file and submits with correct records', async () => {
        const user = userEvent.setup()
        const { study } = await renderIDE('openstax-lab', {
            'main.r': 'print("main")',
            'helper.r': 'print("helper")',
            'utils.r': 'print("utils")',
        })

        await waitFor(() => {
            expect(screen.getByText('utils.r')).toBeInTheDocument()
        })

        await user.click(screen.getByRole('button', { name: 'Remove utils.r' }))

        await waitFor(() => {
            expect(screen.queryByText('utils.r')).not.toBeInTheDocument()
        })

        expect(screen.getByDisplayValue('main.r')).toBeChecked()

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
            { name: 'main.r', fileType: 'MAIN-CODE' },
            { name: 'helper.r', fileType: 'SUPPLEMENTAL-CODE' },
        ])
    })

    it('disables submit after removing all files', async () => {
        const user = userEvent.setup()
        await renderIDE('openstax-lab', {
            'main.r': 'print("main")',
            'helper.r': 'print("helper")',
        })

        await waitFor(() => {
            expect(screen.getByText('main.r')).toBeInTheDocument()
        })

        await user.click(screen.getByRole('button', { name: 'Remove main.r' }))
        await user.click(screen.getByRole('button', { name: 'Remove helper.r' }))

        await waitFor(() => {
            expect(screen.getByText('No files found in workspace.')).toBeInTheDocument()
        })

        expect(screen.getByRole('button', { name: /submit code/i })).toBeDisabled()
    })

    it('removes manually-overridden main and falls back to suggestedMain', async () => {
        const user = userEvent.setup()
        const { study } = await renderIDE('openstax-lab', {
            'main.r': 'print("main")',
            'helper.r': 'print("helper")',
            'utils.r': 'print("utils")',
        })

        await waitFor(() => {
            expect(screen.getByText('helper.r')).toBeInTheDocument()
        })

        await user.click(screen.getByDisplayValue('helper.r'))
        expect(screen.getByDisplayValue('helper.r')).toBeChecked()

        await user.click(screen.getByRole('button', { name: 'Remove helper.r' }))

        await waitFor(() => {
            expect(screen.queryByText('helper.r')).not.toBeInTheDocument()
        })

        expect(screen.getByDisplayValue('main.r')).toBeChecked()

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
            { name: 'main.r', fileType: 'MAIN-CODE' },
            { name: 'utils.r', fileType: 'SUPPLEMENTAL-CODE' },
        ])
    })

    it('submits a single file as main', async () => {
        const user = userEvent.setup()
        const { study } = await renderIDE('openstax-lab', {
            'analysis.r': 'print("only")',
        })

        await waitFor(() => {
            expect(screen.getByText('analysis.r')).toBeInTheDocument()
        })

        expect(screen.getByDisplayValue('analysis.r')).toBeChecked()

        await user.click(screen.getByRole('button', { name: /submit code/i }))

        await waitFor(async () => {
            const updated = await db
                .selectFrom('study')
                .select(['status'])
                .where('id', '=', study.id)
                .executeTakeFirstOrThrow()
            expect(updated.status).toBe('PENDING-REVIEW')
        })

        await expectStudyJobRecords(study.id, [{ name: 'analysis.r', fileType: 'MAIN-CODE' }])
    })

    it('auto-selects first file when no suggestedMain matches', async () => {
        const user = userEvent.setup()
        const { study } = await renderIDE('openstax-lab', {
            'analysis.r': 'print("analysis")',
            'helper.r': 'print("helper")',
        })

        await waitFor(() => {
            expect(screen.getByText('analysis.r')).toBeInTheDocument()
        })

        expect(screen.getByDisplayValue('analysis.r')).toBeChecked()

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
            { name: 'analysis.r', fileType: 'MAIN-CODE' },
            { name: 'helper.r', fileType: 'SUPPLEMENTAL-CODE' },
        ])
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

    describe('OTTER-467 session timeout regression', () => {
        it('submits successfully after unmount and fresh remount with same studyId', async () => {
            const orgSlug = 'openstax-lab'
            const { study } = await setupStudy(orgSlug)
            const root = await createWorkspaceDir('study-code-from-ide')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, {
                'main.R': 'print("main")',
                'helper.R': 'print("helper")',
            })
            const previousHref = `/test-org/study/${study.id}/agreements` as Route

            const onGoBack = vi.fn()
            const { unmount } = renderWithProviders(
                <StudyRequestProvider submittingOrgSlug={orgSlug} initialStudyId={study.id}>
                    <StudyCodeFromIDE
                        studyId={study.id}
                        studyOrgSlug={orgSlug}
                        previousHref={previousHref}
                        onGoBack={onGoBack}
                    />
                </StudyRequestProvider>,
            )

            await waitFor(() => {
                expect(screen.getByText('main.R')).toBeInTheDocument()
            })

            // Simulate session timeout / page reload: destroy the entire React tree
            unmount()

            // Fresh mount with same studyId (as if re-login redirected back to same URL)
            renderWithProviders(
                <StudyRequestProvider submittingOrgSlug={orgSlug} initialStudyId={study.id}>
                    <StudyCodeFromIDE
                        studyId={study.id}
                        studyOrgSlug={orgSlug}
                        previousHref={previousHref}
                        onGoBack={onGoBack}
                    />
                </StudyRequestProvider>,
            )

            await waitFor(() => {
                expect(screen.getByText('main.R')).toBeInTheDocument()
            })

            const user = userEvent.setup()
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
            expect(notifications.show).not.toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Study ID is required to submit' }),
            )
        })
    })
})
