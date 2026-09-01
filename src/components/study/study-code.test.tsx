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
    insertTestCodeEnv,
    it,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
    within,
    writeWorkspaceFiles,
} from '@/tests/unit.helpers'
import { StudyCode } from './study-code'
import { notifications } from '@mantine/notifications'
import type { Route } from 'next'
import { vi } from 'vitest'
import { signedUrlForFile } from '@/server/aws'
import { s3Available } from '@/tests/s3.helpers'

vi.mock('@/server/aws', async () => {
    const actual = await vi.importActual('@/server/aws')
    return {
        ...actual,
        storeS3File: vi.fn(),
        triggerScanForStudyJob: vi.fn(),
        deleteFolderContents: vi.fn(),
        createSignedUploadUrl: vi.fn().mockResolvedValue('https://mock-s3-url.example.com'),
        signedUrlForFile: vi.fn().mockResolvedValue('https://mock-s3-url.example.com/starter.R'),
    }
})

const workspaceRoots: string[] = []

// Submission no longer touches study.status; the durable submit marker is the
// job's CODE-SUBMITTED status change.
const codeSubmittedCount = async (studyId: string) => {
    const row = await db
        .selectFrom('jobStatusChange')
        .innerJoin('studyJob', 'studyJob.id', 'jobStatusChange.studyJobId')
        .where('studyJob.studyId', '=', studyId)
        .where('jobStatusChange.status', '=', 'CODE-SUBMITTED')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .executeTakeFirstOrThrow()
    return Number(row.n)
}

const setupStudy = async (orgSlug = 'openstax-lab') => {
    const { org, user } = await mockSessionWithTestData({ orgSlug, orgType: 'lab' })
    const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
    return { org, user, study }
}

const renderIDE = async (studyOrgSlug = 'openstax-lab', files?: Record<string, string>) => {
    const { study } = await setupStudy(studyOrgSlug)
    if (files) {
        await insertTestBaselineJob(study.id, { createdAt: new Date(Date.now() - 1000) })
        const root = await createWorkspaceDir('study-code')
        workspaceRoots.push(root)
        await writeWorkspaceFiles(root, study.id, files)
    }
    const previousHref = `/test-org/study/${study.id}/agreements` as Route

    renderWithProviders(<StudyCode studyId={study.id} previousHref={previousHref} />)

    return { study, previousHref }
}

describe('StudyCode component', () => {
    beforeEach(() => {
        delete process.env.CODER_FILES
        vi.mocked(signedUrlForFile).mockResolvedValue('https://mock-s3-url.example.com/starter.R')
    })

    afterEach(async () => {
        await cleanupWorkspaceDirs(workspaceRoots)
    })

    it('renders the empty state when the workspace has no files', async () => {
        await renderIDE()

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /launch ide/i })).toBeInTheDocument()
            expect(screen.getByText(/upload your files/i)).toBeInTheDocument()
            expect(screen.getByRole('button', { name: /submit code/i })).toBeDisabled()
        })
    })

    it('does not auto-select a main file when multiple files exist', async () => {
        await renderIDE('openstax-lab', {
            'main.r': 'print("main")',
            'helper.r': 'print("helper")',
        })

        await waitFor(() => {
            expect(screen.getByText('main.r')).toBeInTheDocument()
            expect(screen.getByText('helper.r')).toBeInTheDocument()
            expect(screen.getByRole('button', { name: /submit code/i })).toBeDisabled()
        })

        expect(screen.getByRole('button', { name: /set main\.r as main file/i })).toHaveAttribute(
            'aria-pressed',
            'false',
        )
        expect(screen.getByRole('button', { name: /set helper\.r as main file/i })).toHaveAttribute(
            'aria-pressed',
            'false',
        )
        expect(screen.getByText(/select a main file to submit/i)).toBeInTheDocument()
    })

    it('selects the main file when a star is clicked', async () => {
        const user = userEvent.setup()
        await renderIDE('openstax-lab', {
            'main.r': 'print("main")',
            'helper.r': 'print("helper")',
        })

        await waitFor(() => {
            expect(screen.getByText('helper.r')).toBeInTheDocument()
        })

        const helperStar = screen.getByRole('button', { name: /set helper\.r as main file/i })
        await user.click(helperStar)
        // The override is synchronous useState, but the re-render can lag the click under parallel
        // load — wait for the aria-pressed flip rather than asserting it synchronously.
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /helper\.r is the main file/i })).toHaveAttribute(
                'aria-pressed',
                'true',
            )
        })
        expect(screen.getByRole('button', { name: /set main\.r as main file/i })).toHaveAttribute(
            'aria-pressed',
            'false',
        )
        // Submit-enable also depends on the async last-job query (filesChanged is false
        // until it resolves), so this must be awaited rather than asserted synchronously.
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /submit code/i })).toBeEnabled()
        })
    })

    it('shows the Launch IDE button for all orgs', async () => {
        await renderIDE('some-other-org')

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /launch ide/i })).toBeInTheDocument()
        })
    })

    it('shows the confirmation modal when Submit study code is clicked', async () => {
        const user = userEvent.setup()
        await renderIDE('openstax-lab', { 'main.r': 'print("main")' })

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /submit code/i })).toBeEnabled()
        })

        await user.click(screen.getByRole('button', { name: /submit code/i }))

        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('Confirm study code submission?')
        expect(dialog).toHaveTextContent(
            /Please confirm you are ready to submit your study code\. Further edits are not permitted once submitted\./,
        )
        expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Yes, submit study code' })).toBeInTheDocument()
    })

    // Submitting reuses the open round job, whose cleanup hits real S3
    // (deleteFolderContents) — skip when SeaweedFS isn't running locally; CI has it.
    it.skipIf(!s3Available)('submits IDE files and persists study job records', async () => {
        const user = userEvent.setup()
        const { study } = await renderIDE('openstax-lab', {
            'main.R': 'print("main")',
            'helper.R': 'print("helper")',
        })

        await waitFor(() => {
            expect(screen.getByText('main.R')).toBeInTheDocument()
        })

        await user.click(screen.getByRole('button', { name: /set main\.R as main file/i }))

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /submit code/i })).toBeEnabled()
        })

        await user.click(screen.getByRole('button', { name: /submit code/i }))
        const dialog = screen.getByRole('dialog')
        await user.click(within(dialog).getByRole('button', { name: 'Yes, submit study code' }))

        await waitFor(async () => {
            expect(await codeSubmittedCount(study.id)).toBe(1)
        })

        await expectStudyJobRecords(study.id, [
            { name: 'main.R', fileType: 'MAIN-CODE' },
            { name: 'helper.R', fileType: 'SUPPLEMENTAL-CODE' },
        ])

        expect(notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({ color: 'green', title: 'Study Code Submitted' }),
        )
    })

    it.skipIf(!s3Available)('auto-selects the main file when it is the only file, and submits', async () => {
        const user = userEvent.setup()
        const { study } = await renderIDE('openstax-lab', {
            'analysis.r': 'print("only")',
        })

        await waitFor(() => {
            expect(screen.getByText('analysis.r')).toBeInTheDocument()
            expect(screen.getByRole('button', { name: /analysis\.r is the main file/i })).toHaveAttribute(
                'aria-pressed',
                'true',
            )
            expect(screen.getByRole('button', { name: /submit code/i })).toBeEnabled()
        })

        await user.click(screen.getByRole('button', { name: /submit code/i }))
        const dialog2 = screen.getByRole('dialog')
        await user.click(within(dialog2).getByRole('button', { name: 'Yes, submit study code' }))

        await waitFor(async () => {
            expect(await codeSubmittedCount(study.id)).toBe(1)
        })

        await expectStudyJobRecords(study.id, [{ name: 'analysis.r', fileType: 'MAIN-CODE' }])
    })

    it('keeps the user on the review page after deleting the only file', async () => {
        const user = userEvent.setup()
        await renderIDE('openstax-lab', { 'only.R': 'print("only")' })

        await waitFor(() => {
            expect(screen.getByText('only.R')).toBeInTheDocument()
        })

        await user.click(screen.getByRole('button', { name: /remove only\.r/i }))

        await waitFor(() => {
            expect(screen.queryByText('only.R')).not.toBeInTheDocument()
        })

        expect(screen.getByText('Review files')).toBeInTheDocument()
        expect(screen.queryByText(/write and test your code in ide/i)).not.toBeInTheDocument()
        expect(screen.queryByText('OR')).not.toBeInTheDocument()
    })

    it('renders the previous link', async () => {
        const { previousHref } = await renderIDE()

        const previousLink = screen.getByRole('link', { name: /previous/i })
        expect(previousLink).toHaveAttribute('href', previousHref)
    })

    describe('section header (OTTER-693)', () => {
        it('reuses the shared section header component', async () => {
            await renderIDE()

            // ProposalStepHeader's own test id. A re-implementation of the same eyebrow/title
            // markup would not carry it, and there is a live one of those in
            // view/code-post-submission-view.tsx, so this is what pins reuse.
            expect(await screen.findByTestId('proposal-section-header')).toBeInTheDocument()
        })

        it('renders STEP 3 as the step indicator', async () => {
            await renderIDE()
            const header = await screen.findByTestId('proposal-section-header')

            // Exact string, not a substring: the "STEP 4 of 4" this replaced would satisfy a
            // loose match against "STEP 3" once the number changed.
            expect(within(header).getByText('STEP 3')).toBeInTheDocument()
        })

        it('renders "Submit code" as the section title', async () => {
            await renderIDE()

            // By role: the footer button and the confirmation modal CTA share this label.
            expect(await screen.findByRole('heading', { name: 'Submit code', level: 2 })).toBeInTheDocument()
        })

        it('does not display the study title as body text', async () => {
            const { study } = await renderIDE()
            const header = await screen.findByTestId('proposal-section-header')

            // study.title is nullable on drafts; assert the seed gave us one so the absence
            // check below is testing something.
            const title = study.title ?? ''
            expect(title).not.toBe('')

            expect(within(header).queryByText(/^Title:/)).not.toBeInTheDocument()
            expect(header).not.toHaveTextContent(title)
        })

        it('rules off the header above the page content', async () => {
            await renderIDE()
            const header = await screen.findByTestId('proposal-section-header')

            // The 24px spacing either side of this rule is the card's "spacing lg / divider /
            // spacing lg". It is not assertable here — Mantine compiles `my={24}` to
            // `calc(1.5rem * var(--mantine-scale))` and jsdom loads no stylesheet, so a
            // toHaveStyle check would pin a Mantine internal rather than measure 24px. The
            // spacing is owned by ProposalStepHeader and covered by its own test; what this
            // asserts is that the reused header is what draws the rule, and that the card has
            // content below it rather than being an empty stub.
            expect(within(header).getByTestId('proposal-header-divider')).toBeInTheDocument()
        })
    })

    describe('starter code', () => {
        const renderWithCodeEnv = async (
            files?: Record<string, string>,
            { backdate = true }: { backdate?: boolean } = {},
        ) => {
            const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax-lab', orgType: 'lab' })
            await insertTestCodeEnv({ orgId: org.id, language: 'R', starterCodeFileNames: ['test/path/to/main.R'] })
            const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
            if (files) {
                await insertTestBaselineJob(study.id, { createdAt: new Date(Date.now() + (backdate ? -1000 : 1000)) })
                const root = await createWorkspaceDir('study-code')
                workspaceRoots.push(root)
                await writeWorkspaceFiles(root, study.id, files)
            }
            const previousHref = `/test-org/study/${study.id}/agreements` as Route
            renderWithProviders(<StudyCode studyId={study.id} previousHref={previousHref} />)
            return { study }
        }

        it('shows the inline starter code link when available', async () => {
            await renderWithCodeEnv()

            await waitFor(() => {
                const link = screen.getByRole('link', { name: /starter code/i })
                expect(link).toHaveAttribute('href', expect.stringContaining('mock-s3-url'))
            })
        })

        it('disables submit when starter file has not been modified since IDE launch', async () => {
            await renderWithCodeEnv({ 'main.R': 'print("starter")' }, { backdate: false })

            await waitFor(() => {
                expect(screen.getAllByText('main.R').length).toBeGreaterThan(0)
                expect(screen.getByRole('button', { name: /submit code/i })).toBeDisabled()
                expect(screen.getByText('Modify a file or upload new ones before submitting')).toBeInTheDocument()
            })
        })

        it('enables submit when files are newer than baseline job', async () => {
            const user = userEvent.setup()
            await renderWithCodeEnv({
                'main.R': 'print("starter")',
                'helper.R': 'print("helper")',
            })

            await waitFor(() => {
                expect(screen.getAllByText('main.R').length).toBeGreaterThan(0)
                expect(screen.getByText('helper.R')).toBeInTheDocument()
            })

            await user.click(screen.getByRole('button', { name: /set main\.R as main file/i }))

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /submit code/i })).toBeEnabled()
            })
        })
    })

    describe('session timeout regression', () => {
        it.skipIf(!s3Available)('submits successfully after unmount and fresh remount with same studyId', async () => {
            const orgSlug = 'openstax-lab'
            const { study } = await setupStudy(orgSlug)
            await insertTestBaselineJob(study.id, { createdAt: new Date(Date.now() - 1000) })
            const root = await createWorkspaceDir('study-code')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, {
                'main.R': 'print("main")',
                'helper.R': 'print("helper")',
            })
            const previousHref = `/test-org/study/${study.id}/agreements` as Route

            const { unmount } = renderWithProviders(<StudyCode studyId={study.id} previousHref={previousHref} />)

            await waitFor(() => {
                expect(screen.getByText('main.R')).toBeInTheDocument()
            })

            unmount()

            renderWithProviders(<StudyCode studyId={study.id} previousHref={previousHref} />)

            await waitFor(() => {
                expect(screen.getByText('main.R')).toBeInTheDocument()
            })

            const user = userEvent.setup()
            await user.click(screen.getByRole('button', { name: /set main\.R as main file/i }))

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /submit code/i })).toBeEnabled()
            })

            await user.click(screen.getByRole('button', { name: /submit code/i }))
            const dialog = screen.getByRole('dialog')
            await user.click(within(dialog).getByRole('button', { name: 'Yes, submit study code' }))

            await waitFor(async () => {
                expect(await codeSubmittedCount(study.id)).toBe(1)
            })

            await expectStudyJobRecords(study.id, [
                { name: 'main.R', fileType: 'MAIN-CODE' },
                { name: 'helper.R', fileType: 'SUPPLEMENTAL-CODE' },
            ])

            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({ color: 'green', title: 'Study Code Submitted' }),
            )
        })
    })
})
