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
import { createUserAndWorkspace, getCoderWorkspaceLaunchStatus } from '@/server/coder'
import { s3Available } from '@/tests/s3.helpers'
import { MAX_UPLOAD_FILE_BYTES } from '@/lib/types'
import { listWorkspaceFilesAction } from '@/server/actions/workspaces.actions'

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

// Same treatment as @/server/aws above: an external service with no instance in the unit env. Left
// unmocked, every launch throws on a refused connection, and since the launch action claims the
// study's IDE in the same transaction, the claim would roll back with it.
vi.mock('@/server/coder', async () => {
    const actual = await vi.importActual<typeof import('@/server/coder')>('@/server/coder')
    return {
        ...actual,
        createUserAndWorkspace: vi.fn(),
        getCoderWorkspaceLaunchStatus: vi.fn(),
    }
})

const launchStatus = (overrides: Record<string, unknown> = {}) => ({
    buildStatus: 'running',
    buildLogLines: [],
    agentStatus: null,
    agentLogLines: [],
    ready: true,
    failed: false,
    reason: 'test workspace ready',
    cursors: { build: null, agent: null },
    url: 'https://coder.test.example/workspace',
    ...overrides,
})

const workspaceRoots: string[] = []

// The durable submit marker is the job's CODE-SUBMITTED status change, not study.status.
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

const DATA_PARTNER = 'Test Data Partner'

const renderIDE = async (
    studyOrgSlug = 'openstax-lab',
    files?: Record<string, string>,
    { dataPartnerName = DATA_PARTNER }: { dataPartnerName?: string } = {},
) => {
    const { study } = await setupStudy(studyOrgSlug)
    if (files) {
        await insertTestBaselineJob(study.id, { createdAt: new Date(Date.now() - 1000) })
        const root = await createWorkspaceDir('study-code')
        workspaceRoots.push(root)
        await writeWorkspaceFiles(root, study.id, files)
    }
    const previousHref = `/test-org/study/${study.id}/agreements` as Route

    renderWithProviders(<StudyCode studyId={study.id} dataPartnerName={dataPartnerName} previousHref={previousHref} />)

    return { study, previousHref, dataPartnerName }
}

const faqControl = () => screen.getByRole('button', { name: /New to SafeInsights IDE/ })

describe('StudyCode component', () => {
    beforeEach(() => {
        delete process.env.CODER_FILES
        vi.mocked(signedUrlForFile).mockResolvedValue('https://mock-s3-url.example.com/starter.R')
        vi.mocked(createUserAndWorkspace).mockResolvedValue({
            success: true,
            workspace: { id: 'ws-test' } as Awaited<ReturnType<typeof createUserAndWorkspace>>['workspace'],
        })
        vi.mocked(getCoderWorkspaceLaunchStatus).mockResolvedValue(
            launchStatus() as Awaited<ReturnType<typeof getCoderWorkspaceLaunchStatus>>,
        )
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

        expect(screen.getByRole('radio', { name: /set main\.r as main file/i })).toHaveAttribute(
            'aria-checked',
            'false',
        )
        expect(screen.getByRole('radio', { name: /set helper\.r as main file/i })).toHaveAttribute(
            'aria-checked',
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

        const helperStar = screen.getByRole('radio', { name: /set helper\.r as main file/i })
        await user.click(helperStar)
        await waitFor(() => {
            expect(screen.getByRole('radio', { name: /helper\.r is the main file/i })).toHaveAttribute(
                'aria-checked',
                'true',
            )
        })
        expect(screen.getByRole('radio', { name: /set main\.r as main file/i })).toHaveAttribute(
            'aria-checked',
            'false',
        )
        // Submit-enable depends on the async last-job query, so it cannot be asserted synchronously.
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

    // Job cleanup hits real S3, which is not running locally by default; CI has it.
    it.skipIf(!s3Available)('submits IDE files and persists study job records', async () => {
        const user = userEvent.setup()
        const { study } = await renderIDE('openstax-lab', {
            'main.R': 'print("main")',
            'helper.R': 'print("helper")',
        })

        await waitFor(() => {
            expect(screen.getByText('main.R')).toBeInTheDocument()
        })

        await user.click(screen.getByRole('radio', { name: /set main\.R as main file/i }))

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
            expect(screen.getByRole('radio', { name: /analysis\.r is the main file/i })).toHaveAttribute(
                'aria-checked',
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

    it('keeps the user on the review page after deleting a file', async () => {
        const user = userEvent.setup()
        await renderIDE('openstax-lab', { 'main.R': 'print("main")', 'spare.R': 'print("spare")' })

        await waitFor(() => {
            expect(screen.getByText('spare.R')).toBeInTheDocument()
        })

        // main.R is the main file, so spare.R is the one the card permits deleting.
        await user.click(screen.getByRole('radio', { name: /set main\.R as main file/i }))
        await user.click(screen.getByRole('button', { name: /delete spare\.R/i }))
        await user.click(screen.getByRole('button', { name: 'Delete file' }))

        await waitFor(() => {
            expect(screen.queryByText('spare.R')).not.toBeInTheDocument()
        })

        expect(screen.getByRole('heading', { name: 'Code files' })).toBeInTheDocument()
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

    describe('static body copy (OTTER-693)', () => {
        it('renders the copy exactly', async () => {
            await renderIDE()

            // toHaveTextContent normalises whitespace, which is what lets this assert the copy as
            // one sentence run across the emphasised span the design calls for.
            expect(await screen.findByTestId('submit-code-intro')).toHaveTextContent(
                'Develop and test your code in the SafeInsights IDE (Integrated Development Environment) with ' +
                    `preloaded example data from ${DATA_PARTNER}. The IDE opens in a new tab, and any files you ` +
                    'create will appear here automatically. When you are ready, return here, select your main file, ' +
                    'and submit your code for review.',
            )
        })

        it('interpolates the Data Partner rather than hardcoding one', async () => {
            // A second, different name: the assertion above alone would pass on a hardcoded string.
            await renderIDE('openstax-lab', undefined, { dataPartnerName: 'Rice University' })

            expect(await screen.findByTestId('submit-code-intro')).toHaveTextContent(
                'preloaded example data from Rice University.',
            )
        })
    })

    describe('FAQ section (OTTER-693)', () => {
        const FAQ_COPY: [question: string, answer: string][] = [
            [
                'What is the SafeInsights IDE?',
                'It is a research workspace built on VS Code. You can explore preloaded example data, build and test code with the same libraries as a Data Partner’s secure enclave, ask an AI assistant about the datasets, and preview your outputs. Because previews run on example data, they confirm your code works, not what your findings will be.',
            ],
            [
                'Who can use the SafeInsights IDE for a study?',
                'Each study’s IDE is assigned to the first person who launches it. Once launched, access cannot be shared or transferred. Confirm with your team who will be coding before anyone launches the IDE. If the assigned person becomes unavailable, contact support to discuss your options.',
            ],
            [
                'What is example data?',
                'It is an example dataset from a Data Partner that mirrors the structure of the real data in their secure enclave but uses made-up values. You can test your code against it safely, without accessing real data or using an enclave run. Because the values are not real, your example outputs will be different from your actual findings.',
            ],
            [
                'What is the main file?',
                'It is the file that runs first in the secure enclave. It can call other files in your study. Select your main file before submitting.',
            ],
            [
                'What is the main file template?',
                `It is a template from ${DATA_PARTNER} that connects to their dataset. You’ll see it listed below, and it’s pre-loaded as your starting point when you click Launch IDE. Leave the fixed setup code unchanged, or your code will not work correctly. The rest is a working example with reference notes you can edit or replace with your own code.`,
            ],
            [
                'Is my work saved if I close this tab or the IDE?',
                'Yes. Your work is automatically saved here in your study’s workspace, so you can safely log out or close either the SI tab or IDE tab and pick up right where you left off.',
            ],
            [
                'What happens after I submit my code?',
                `${DATA_PARTNER} will review your code before it runs in their secure enclave against real data. Once the analysis is complete, ${DATA_PARTNER} will review the outputs and share them with you. You will receive an email when your outputs are available.`,
            ],
        ]

        it('renders the accordion under the body copy', async () => {
            await renderIDE()

            expect(await screen.findByTestId('submit-code-faq')).toBeInTheDocument()
            expect(faqControl()).toBeInTheDocument()
        })

        it('starts collapsed', async () => {
            await renderIDE()

            expect(faqControl()).toHaveAttribute('aria-expanded', 'false')
        })

        it('toggles on click, in both directions', async () => {
            const user = userEvent.setup()
            await renderIDE()

            await user.click(faqControl())
            await waitFor(() => expect(faqControl()).toHaveAttribute('aria-expanded', 'true'))

            await user.click(faqControl())
            await waitFor(() => expect(faqControl()).toHaveAttribute('aria-expanded', 'false'))
        })

        it.each(FAQ_COPY)('answers "%s"', async (question, answer) => {
            await renderIDE()

            // Collapsed by default now, and Mantine keeps panel children mounted, so the section is
            // queryable either way; opening it first keeps the test honest about what a reader sees.
            await userEvent.setup().click(faqControl())

            const section = await screen.findByTestId(`faq-section-${question}`)
            expect(section).toHaveTextContent(question)
            expect(section).toHaveTextContent(answer)
        })

        it('interpolates the Data Partner into the answers that name them', async () => {
            await renderIDE('openstax-lab', undefined, { dataPartnerName: 'Rice University' })
            await userEvent.setup().click(faqControl())

            const faq = await screen.findByTestId('submit-code-faq')
            expect(faq).toHaveTextContent('It is a template from Rice University that connects to their dataset.')
            expect(faq).toHaveTextContent(
                'Rice University will review your code before it runs in their secure enclave against real data. ' +
                    'Once the analysis is complete, Rice University will review the outputs',
            )
            // The card words this one generically, so it must NOT pick up the partner name.
            expect(faq).toHaveTextContent('It is an example dataset from a Data Partner that mirrors')
        })
    })

    describe('Your files section (OTTER-693)', () => {
        const TWO_FILES = { 'main.R': 'print("main")', 'spare.R': 'print("spare")' }

        const renderFiles = async (files = TWO_FILES) => {
            const rendered = await renderIDE('openstax-lab', files)
            await waitFor(() => expect(screen.getByText('spare.R')).toBeInTheDocument())
            return rendered
        }

        it('renders as its own card, separate from the step header', async () => {
            await renderFiles()

            const section = screen.getByTestId('your-files-section')
            expect(section).toBeInTheDocument()
            expect(screen.getByRole('heading', { name: 'Code files' })).toBeInTheDocument()
            expect(within(section).getByTestId('your-files-divider')).toBeInTheDocument()
            // The whole point of row 6: the files no longer live inside the STEP 3 card.
            expect(screen.getByTestId('proposal-section-header')).not.toContainElement(section)
        })

        it('renders the four specified columns', async () => {
            await renderFiles()

            const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
            expect(headers).toEqual(['Main file', 'File name', 'Last activity', 'Actions'])
        })

        it('defaults Last activity to "No activity yet" for a file nothing has touched', async () => {
            await renderFiles()

            // Files written straight to disk by the fixture have no recorded activity, which is
            // also the real state of a starter file a launch copied in.
            expect(screen.getAllByText('No activity yet')).toHaveLength(2)
        })

        it('makes the main-file stars a radio group', async () => {
            const user = userEvent.setup()
            await renderFiles()

            await user.click(screen.getByRole('radio', { name: /set main\.R as main file/i }))
            await waitFor(() => {
                expect(screen.getByRole('radio', { name: /main\.R is the main file/i })).toBeChecked()
            })
            expect(screen.getByRole('radio', { name: /set spare\.R as main file/i })).not.toBeChecked()
        })

        it('opens the file viewer when a file name is clicked', async () => {
            const user = userEvent.setup()
            await renderFiles()

            await user.click(screen.getByRole('button', { name: 'View spare.R' }))

            await waitFor(() => {
                expect(screen.getByRole('dialog')).toHaveTextContent('spare.R')
            })
        })

        it('truncates a file name past 50 characters and keeps the full name reachable', async () => {
            const longName = `${'a'.repeat(60)}.R`
            await renderIDE('openstax-lab', { [longName]: 'print(1)', 'spare.R': 'print(2)' })

            await waitFor(() => expect(screen.getByText(`${'a'.repeat(50)}…`)).toBeInTheDocument())
            // Full name stays in the accessible name even though the visible text is clipped.
            expect(screen.getByRole('button', { name: `View ${longName}` })).toBeInTheDocument()
        })

        it('disables delete for the main file and explains why', async () => {
            const user = userEvent.setup()
            await renderFiles()

            await user.click(screen.getByRole('radio', { name: /set main\.R as main file/i }))

            await waitFor(() => {
                expect(screen.getByRole('button', { name: 'Delete main.R' })).toBeDisabled()
            })
            expect(screen.getByRole('button', { name: 'Delete spare.R' })).toBeEnabled()
        })

        it('confirms before deleting, and names the file in the modal', async () => {
            const user = userEvent.setup()
            await renderFiles()

            await user.click(screen.getByRole('radio', { name: /set main\.R as main file/i }))
            await user.click(screen.getByRole('button', { name: 'Delete spare.R' }))

            const dialog = screen.getByRole('dialog')
            expect(dialog).toHaveTextContent('Delete file')
            expect(dialog).toHaveTextContent(
                'spare.R will be permanently removed from your study and cannot be recovered.',
            )

            // Cancelling leaves the file alone.
            await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
            expect(screen.getByText('spare.R')).toBeInTheDocument()
        })

        it('offers edit, download and delete on every row', async () => {
            await renderFiles()

            for (const name of ['main.R', 'spare.R']) {
                expect(screen.getByRole('button', { name: `Edit ${name} in IDE` })).toBeInTheDocument()
                expect(screen.getByRole('button', { name: `Download ${name}` })).toBeInTheDocument()
                expect(screen.getByRole('button', { name: `Delete ${name}` })).toBeInTheDocument()
            }
        })
    })

    describe('IDE ownership (OTTER-693)', () => {
        const FILES = { 'main.R': 'print("main")', 'spare.R': 'print("spare")' }

        const claimIdeFor = async (studyId: string, userId: string) =>
            db.updateTable('study').set({ ideOwnerId: userId }).where('id', '=', studyId).execute()

        it('leaves the pencil enabled while nobody has claimed the IDE', async () => {
            await renderIDE('openstax-lab', FILES)

            await waitFor(() => {
                expect(screen.getByRole('button', { name: 'Edit main.R in IDE' })).toBeEnabled()
            })
        })

        const ideOwnerId = async (studyId: string) => {
            const row = await db
                .selectFrom('study')
                .select('ideOwnerId')
                .where('id', '=', studyId)
                .executeTakeFirstOrThrow()
            return row.ideOwnerId
        }

        it('claims the IDE for whoever launches it first', async () => {
            const { study } = await renderIDE('openstax-lab', FILES)

            await waitFor(() => expect(screen.getByText('spare.R')).toBeInTheDocument())
            await userEvent.setup().click(screen.getByRole('button', { name: 'Edit main.R in IDE' }))

            // The pencil launches the workspace, and launching is what takes ownership — so the
            // pencil claims it just as the Launch IDE button does.
            await waitFor(async () => {
                expect(await ideOwnerId(study.id)).not.toBeNull()
            })
        })

        it('does not claim the IDE when the launch fails', async () => {
            vi.mocked(createUserAndWorkspace).mockRejectedValueOnce(new Error('coder unreachable'))
            const { study } = await renderIDE('openstax-lab', FILES)

            await waitFor(() => expect(screen.getByText('spare.R')).toBeInTheDocument())
            await userEvent.setup().click(screen.getByRole('button', { name: 'Edit main.R in IDE' }))

            // The claim shares the launch action's transaction on purpose: a study that locked
            // itself to a failed launch could only be freed by support.
            await waitFor(() => expect(screen.getByRole('button', { name: 'Edit main.R in IDE' })).toBeEnabled())
            expect(await ideOwnerId(study.id)).toBeNull()
        })

        it('keeps the pencil enabled for the researcher who owns it', async () => {
            const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax-lab', orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
            await claimIdeFor(study.id, user.id)
            await insertTestBaselineJob(study.id, { createdAt: new Date(Date.now() - 1000) })
            const root = await createWorkspaceDir('study-code')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, FILES)

            renderWithProviders(
                <StudyCode studyId={study.id} dataPartnerName={DATA_PARTNER} previousHref={'/test' as Route} />,
            )

            await waitFor(() => {
                expect(screen.getByRole('button', { name: 'Edit main.R in IDE' })).toBeEnabled()
            })
        })

        it('disables the pencil and names the owner once someone else holds the IDE', async () => {
            const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax-lab', orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

            // A second researcher on the same study got there first.
            const owner = await db
                .insertInto('user')
                .values({ clerkId: 'clerk-ide-owner', firstName: 'Ada', lastName: 'Lovelace' })
                .returning(['id', 'fullName'])
                .executeTakeFirstOrThrow()
            await claimIdeFor(study.id, owner.id)

            await insertTestBaselineJob(study.id, { createdAt: new Date(Date.now() - 1000) })
            const root = await createWorkspaceDir('study-code')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, FILES)

            renderWithProviders(
                <StudyCode studyId={study.id} dataPartnerName={DATA_PARTNER} previousHref={'/test' as Route} />,
            )

            await waitFor(() => {
                expect(screen.getByRole('button', { name: 'Edit main.R in IDE' })).toBeDisabled()
            })
            expect(screen.getByRole('button', { name: 'Edit spare.R in IDE' })).toBeDisabled()
            // Download and delete are unaffected: the lock is on IDE editing, not the whole row.
            expect(screen.getByRole('button', { name: 'Download main.R' })).toBeEnabled()
        })
    })

    describe('Launch IDE button (OTTER-693)', () => {
        const FILES = { 'main.R': 'print(1)' }
        const launchButton = () => screen.getByRole('button', { name: /launch ide/i })

        /**
         * `owner` resolves after the session exists, so 'viewer' genuinely means the signed-in
         * researcher holds the IDE rather than a second user who merely looks like them.
         */
        const renderWithOwner = async (owner: 'none' | 'viewer' | 'other') => {
            const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax-lab', orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

            let ownerName: string | null = null
            if (owner !== 'none') {
                const ideOwner =
                    owner === 'viewer'
                        ? { id: user.id, fullName: user.fullName }
                        : await db
                              .insertInto('user')
                              .values({ clerkId: `clerk-ide-${study.id}`, firstName: 'Ada', lastName: 'Lovelace' })
                              .returning(['id', 'fullName'])
                              .executeTakeFirstOrThrow()
                ownerName = ideOwner.fullName
                await db.updateTable('study').set({ ideOwnerId: ideOwner.id }).where('id', '=', study.id).execute()
            }
            await insertTestBaselineJob(study.id, { createdAt: new Date(Date.now() - 1000) })
            const root = await createWorkspaceDir('study-code')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, FILES)

            renderWithProviders(
                <StudyCode studyId={study.id} dataPartnerName={DATA_PARTNER} previousHref={'/test' as Route} />,
            )
            await waitFor(() => expect(screen.getByText('main.R')).toBeInTheDocument())
            return { study, user, ownerName }
        }

        it('sits in the card header, once, alongside the section title', async () => {
            await renderWithOwner('none')

            const card = screen.getByTestId('your-files-section')
            expect(within(card).getAllByRole('button', { name: /launch ide/i })).toHaveLength(1)
        })

        it('is enabled with the locking warning while nobody has claimed it', async () => {
            await renderWithOwner('none')

            expect(launchButton()).toBeEnabled()
            expect(screen.getByText('Launching locks the IDE to you for this study.')).toBeInTheDocument()
        })

        it('drops the locking warning once the viewer has claimed it', async () => {
            await renderWithOwner('viewer')

            await waitFor(() => {
                expect(screen.queryByText('Launching locks the IDE to you for this study.')).not.toBeInTheDocument()
            })
            // Still the owner's to use, so it stays clickable.
            expect(launchButton()).toBeEnabled()
        })

        it('disables the button when another researcher holds the IDE', async () => {
            await renderWithOwner('other')

            await waitFor(() => expect(launchButton()).toBeDisabled())
            expect(screen.queryByText('Launching locks the IDE to you for this study.')).not.toBeInTheDocument()
        })

        it('explains on hover why the IDE is unavailable, naming the owner', async () => {
            const { ownerName } = await renderWithOwner('other')
            await waitFor(() => expect(launchButton()).toBeDisabled())

            await userEvent.setup().hover(launchButton())

            await waitFor(() => {
                expect(screen.getByText('IDE unavailable')).toBeInTheDocument()
            })
            expect(screen.getByText(new RegExp(`${ownerName} is using the IDE for this study\\.`))).toBeInTheDocument()
        })

        it('explains on hover what launching does when it is available', async () => {
            await renderWithOwner('none')

            await userEvent.setup().hover(launchButton())

            await waitFor(() => {
                expect(
                    screen.getByText(/Opens your files in the IDE where you can edit and refine/),
                ).toBeInTheDocument()
            })
        })
    })

    describe('Already have code section (OTTER-693)', () => {
        const codeFile = (name: string, contents = 'print(1)') => new File([contents], name, { type: 'text/plain' })

        const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement

        const renderWithFiles = async (files: Record<string, string> = { 'main.R': 'print(1)' }) => {
            const rendered = await renderIDE('openstax-lab', files)
            await waitFor(() => expect(screen.getByTestId('already-have-code')).toBeInTheDocument())
            return rendered
        }

        const workspaceNames = async (studyId: string) => {
            const result = await listWorkspaceFilesAction({ studyId })
            if ('error' in result) throw new Error('listing failed')
            return result.files.map((f) => f.name).sort()
        }

        it('renders the section with its copy and the upload link', async () => {
            await renderWithFiles()

            const section = screen.getByTestId('already-have-code')
            expect(section).toHaveTextContent('Already have code?')
            expect(section).toHaveTextContent(
                /Download the template file from the table above\. Add your code, then edit and test it in the SafeInsights IDE against example data\./,
            )
            expect(section).toHaveTextContent(
                '(Accepted formats: .r, .rmd, .json, .csv, .txt, .py, .ipynb. File size: 3 MB max.)',
            )
            expect(within(section).getByRole('button', { name: 'Upload your existing files' })).toBeInTheDocument()
        })

        it('uploads a new file and reports it as a success', async () => {
            const { study } = await renderWithFiles()

            await userEvent.setup().upload(fileInput(), codeFile('extra.R'))

            await waitFor(async () => {
                expect(await workspaceNames(study.id)).toEqual(['extra.R', 'main.R'])
            })
            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'extra.R is uploaded.', color: 'green' }),
            )
        })

        it('rejects a file over 3 MB, naming it, without uploading', async () => {
            const { study } = await renderWithFiles()
            const tooBig = codeFile('huge.R', 'x'.repeat(MAX_UPLOAD_FILE_BYTES + 1))

            await userEvent.setup().upload(fileInput(), tooBig)

            await waitFor(() => {
                expect(notifications.show).toHaveBeenCalledWith(
                    expect.objectContaining({
                        title: 'huge.R failed to upload.',
                        message: 'Maximum file size is 3 MB.',
                        color: 'red',
                    }),
                )
            })
            expect(await workspaceNames(study.id)).toEqual(['main.R'])
        })

        it('categorises its toasts so later logic can key on the kind, not the colour', async () => {
            await renderWithFiles()

            await userEvent.setup().upload(fileInput(), codeFile('extra.R'))

            // The card asks for Success/Error to be explicit, because later work builds on it.
            await waitFor(() => {
                expect(notifications.show).toHaveBeenCalledWith(
                    expect.objectContaining({ 'data-toast-kind': 'success' }),
                )
            })
        })

        describe('duplicate file names', () => {
            const uploadColliding = async () => {
                const rendered = await renderWithFiles()
                await userEvent.setup().upload(fileInput(), codeFile('main.R', 'print("new")'))
                await screen.findByText('Replace existing file?')
                return rendered
            }

            it('asks before overwriting, naming the file', async () => {
                await uploadColliding()

                const heading = screen.getByText('Replace existing file?')
                const dialog = heading.closest('[role="dialog"]') as HTMLElement
                expect(dialog).toHaveTextContent(
                    /A file named main\.R already exists in SafeInsights\. Replacing this file will overwrite and permanently delete the current version/,
                )
                expect(within(dialog).getByRole('button', { name: 'Replace' })).toBeInTheDocument()
                expect(within(dialog).getByRole('button', { name: 'Keep both' })).toBeInTheDocument()
                expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
            })

            it('leaves the workspace untouched on Cancel', async () => {
                const { study } = await uploadColliding()

                await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }))

                await waitFor(() => expect(screen.queryByText('Replace existing file?')).not.toBeInTheDocument())
                expect(await workspaceNames(study.id)).toEqual(['main.R'])
            })

            it('overwrites in place on Replace', async () => {
                const { study } = await uploadColliding()

                await userEvent.setup().click(screen.getByRole('button', { name: 'Replace' }))

                await waitFor(() => {
                    expect(notifications.show).toHaveBeenCalledWith(
                        expect.objectContaining({ title: 'main.R is uploaded.' }),
                    )
                })
                // Same name, new contents: no second file appears.
                expect(await workspaceNames(study.id)).toEqual(['main.R'])
            })

            it('suffixes the arriving file on Keep both, leaving the original alone', async () => {
                const { study } = await uploadColliding()

                await userEvent.setup().click(screen.getByRole('button', { name: 'Keep both' }))

                await waitFor(async () => {
                    expect(await workspaceNames(study.id)).toEqual(['main (1).R', 'main.R'])
                })
                expect(notifications.show).toHaveBeenCalledWith(
                    expect.objectContaining({ title: 'main (1).R is uploaded.' }),
                )
            })
        })
    })

    describe('IDE launch progress modal (OTTER-693)', () => {
        const FILES = { 'main.R': 'print(1)' }

        // Keeps the launch in flight the way a real one is: the workspace provisions but is not
        // ready yet, so no url arrives and the modal stays up. Every promise still settles, which
        // a never-resolving one did not — it hung every test that ran after these.
        const stillProvisioning = () =>
            vi
                .mocked(getCoderWorkspaceLaunchStatus)
                .mockResolvedValue(
                    launchStatus({ ready: false, url: undefined, reason: 'provisioning' }) as Awaited<
                        ReturnType<typeof getCoderWorkspaceLaunchStatus>
                    >,
                )

        const startLaunch = async () => {
            const rendered = await renderIDE('openstax-lab', FILES)
            await waitFor(() => expect(screen.getByText('main.R')).toBeInTheDocument())
            await userEvent.setup().click(screen.getByRole('button', { name: /launch ide/i }))
            return rendered
        }

        it('opens on launch with the countdown, the bar and the sync copy', async () => {
            stillProvisioning()
            await startLaunch()

            const dialog = await screen.findByRole('dialog')
            expect(dialog).toHaveTextContent('Setting up the SafeInsights IDE')
            expect(dialog).toHaveTextContent('Launching the IDE in a new tab')
            expect(dialog).toHaveTextContent(/Ready in \d+ minutes/)
            expect(within(dialog).getByRole('progressbar', { name: 'Launch progress' })).toBeInTheDocument()
            expect(dialog).toHaveTextContent(/The IDE opens in a new tab\./)
            expect(dialog).toHaveTextContent(`to ${DATA_PARTNER} for review.`)
        })

        it('abandons the launch when dismissed, so no IDE tab opens', async () => {
            stillProvisioning()
            const openSpy = vi.spyOn(window, 'open')
            await startLaunch()

            const dialog = await screen.findByRole('dialog')
            await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Close' }))

            await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
            // The card's rule: a launch the researcher walked away from must not steal a tab.
            expect(openSpy).not.toHaveBeenCalled()
            openSpy.mockRestore()
        })
    })

    describe('IDE launch failure modal (OTTER-693)', () => {
        const FILES = { 'main.R': 'print(1)' }

        it('replaces the launch with a failure modal, and retries on Try again', async () => {
            vi.mocked(createUserAndWorkspace).mockRejectedValue(new Error('coder unreachable'))
            await renderIDE('openstax-lab', FILES)
            await waitFor(() => expect(screen.getByText('main.R')).toBeInTheDocument())

            const user = userEvent.setup()
            await user.click(screen.getByRole('button', { name: /launch ide/i }))

            // The progress modal gives way to this one, and Mantine keeps it mounted through its
            // exit transition, so both dialogs exist for a moment. Reaching up from the failure
            // heading picks the right one regardless of timing.
            const heading = await screen.findByText('IDE failed to launch')
            const dialog = heading.closest('[role="dialog"]') as HTMLElement
            expect(dialog).toHaveTextContent('Setting up the SafeInsights IDE')
            expect(dialog).toHaveTextContent(/If the issue persists, contact SafeInsights support with Ref:/)

            // Try again re-attempts rather than only dismissing. Awaited because the retry goes
            // through the launch mutation rather than firing on the click itself.
            vi.mocked(createUserAndWorkspace).mockClear()
            await user.click(within(dialog).getByRole('button', { name: 'Try again' }))
            await waitFor(() => expect(vi.mocked(createUserAndWorkspace)).toHaveBeenCalled())
        })

        it('closes without retrying when dismissed', async () => {
            vi.mocked(createUserAndWorkspace).mockRejectedValue(new Error('coder unreachable'))
            await renderIDE('openstax-lab', FILES)
            await waitFor(() => expect(screen.getByText('main.R')).toBeInTheDocument())

            const user = userEvent.setup()
            await user.click(screen.getByRole('button', { name: /launch ide/i }))

            const heading = await screen.findByText('IDE failed to launch')
            const dialog = heading.closest('[role="dialog"]') as HTMLElement
            await user.click(within(dialog).getByRole('button', { name: 'Close' }))

            await waitFor(() => expect(screen.queryByText('IDE failed to launch')).not.toBeInTheDocument())
        })
    })

    describe('Last activity (OTTER-693)', () => {
        const recordActivity = async (
            studyId: string,
            fileName: string,
            action: 'UPLOADED' | 'EDITED_IN_IDE',
            userId: string,
            createdAt: Date,
        ) => db.insertInto('workspaceFileActivity').values({ studyId, fileName, action, userId, createdAt }).execute()

        it('names the researcher, the action and the time', async () => {
            const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax-lab', orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
            await insertTestBaselineJob(study.id, { createdAt: new Date(Date.now() - 1000) })
            const root = await createWorkspaceDir('study-code')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, { 'main.R': 'print(1)', 'helper.R': 'print(2)' })

            await recordActivity(study.id, 'main.R', 'UPLOADED', user.id, new Date('2026-07-15T15:50:00Z'))
            await recordActivity(study.id, 'helper.R', 'EDITED_IN_IDE', user.id, new Date('2026-07-21T16:10:00Z'))

            renderWithProviders(
                <StudyCode studyId={study.id} dataPartnerName={DATA_PARTNER} previousHref={'/test' as Route} />,
            )

            await waitFor(() => {
                expect(screen.getByText(new RegExp(`${user.fullName} · Uploaded · Jul 15, 2026,`))).toBeInTheDocument()
            })
            expect(screen.getByText(new RegExp(`${user.fullName} · Edited in IDE · Jul 21, 2026,`))).toBeInTheDocument()
            expect(screen.queryByText('No activity yet')).not.toBeInTheDocument()
        })

        it('shows only the most recent action for a file', async () => {
            const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax-lab', orgType: 'lab' })
            const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
            await insertTestBaselineJob(study.id, { createdAt: new Date(Date.now() - 1000) })
            const root = await createWorkspaceDir('study-code')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, { 'main.R': 'print(1)' })

            await recordActivity(study.id, 'main.R', 'UPLOADED', user.id, new Date('2026-07-15T15:50:00Z'))
            await recordActivity(study.id, 'main.R', 'EDITED_IN_IDE', user.id, new Date('2026-07-21T16:10:00Z'))

            renderWithProviders(
                <StudyCode studyId={study.id} dataPartnerName={DATA_PARTNER} previousHref={'/test' as Route} />,
            )

            // The column reports the latest action, not a history.
            await waitFor(() => {
                expect(screen.getByText(/Edited in IDE · Jul 21, 2026,/)).toBeInTheDocument()
            })
            expect(screen.queryByText(/Uploaded · Jul 15, 2026,/)).not.toBeInTheDocument()
        })

        it('records an upload against the researcher who uploaded it', async () => {
            // Seeded with a file so the workspace directory exists: renderIDE only creates it when
            // given files, and without it CODER_FILES is unset and the upload has nowhere to land.
            const { study } = await renderIDE('openstax-lab', { 'main.R': 'print(1)' })
            await waitFor(() => expect(screen.getByText('main.R')).toBeInTheDocument())

            const input = document.querySelector('input[type="file"]') as HTMLInputElement
            await userEvent.setup().upload(input, new File(['print(1)'], 'fresh.R', { type: 'text/plain' }))

            await waitFor(async () => {
                const rows = await db
                    .selectFrom('workspaceFileActivity')
                    .select(['fileName', 'action'])
                    .where('studyId', '=', study.id)
                    .execute()
                expect(rows).toEqual([{ fileName: 'fresh.R', action: 'UPLOADED' }])
            })
        })

        it('records an IDE edit against the file whose pencil was clicked', async () => {
            const { study } = await renderIDE('openstax-lab', {
                'main.R': 'print(1)',
                'helper.R': 'print(2)',
            })
            await waitFor(() => expect(screen.getByText('helper.R')).toBeInTheDocument())

            await userEvent.setup().click(screen.getByRole('button', { name: 'Edit helper.R in IDE' }))

            await waitFor(async () => {
                const rows = await db
                    .selectFrom('workspaceFileActivity')
                    .select(['fileName', 'action'])
                    .where('studyId', '=', study.id)
                    .execute()
                expect(rows).toEqual([{ fileName: 'helper.R', action: 'EDITED_IN_IDE' }])
            })
        })
    })

    describe('template badge (OTTER-693)', () => {
        /**
         * `pristine` decides whether the starter file still counts as the untouched template: the
         * badge keys off the file's mtime sitting at or before the baseline job, which is how
         * initializeWorkspaceCodeFiles backdates a freshly copied starter file.
         */
        const renderWithTemplate = async ({ pristine }: { pristine: boolean }) => {
            const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax-lab', orgType: 'lab' })
            await insertTestCodeEnv({ orgId: org.id, language: 'R', starterCodeFileNames: ['main.R'] })
            const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

            await insertTestBaselineJob(study.id, {
                createdAt: new Date(Date.now() + (pristine ? 60_000 : -60_000)),
            })
            const root = await createWorkspaceDir('study-code')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, {
                'main.R': 'print("starter")',
                'mine.R': 'print("mine")',
            })

            renderWithProviders(
                <StudyCode studyId={study.id} dataPartnerName={DATA_PARTNER} previousHref={'/test' as Route} />,
            )
            await waitFor(() => expect(screen.getByText('mine.R')).toBeInTheDocument())
            return { study }
        }

        it('badges the untouched starter file, and only that file', async () => {
            await renderWithTemplate({ pristine: true })

            await waitFor(() => expect(screen.getByText('Template')).toBeInTheDocument())
            // One badge, on the Data Partner's file rather than the researcher's own upload.
            expect(screen.getAllByText('Template')).toHaveLength(1)
            const templateRow = screen.getByRole('button', { name: 'View main.R' }).closest('tr')
            expect(templateRow).toHaveTextContent('Template')
        })

        it('drops the badge once the starter file has been edited or replaced', async () => {
            await renderWithTemplate({ pristine: false })

            expect(screen.queryByText('Template')).not.toBeInTheDocument()
        })

        it('explains the template on hover, in the same words as the FAQ', async () => {
            await renderWithTemplate({ pristine: true })
            await waitFor(() => expect(screen.getByText('Template')).toBeInTheDocument())

            const copy = () => screen.queryAllByText(/It is a template from Test Data Partner that connects to their/)
            // One copy already on the page: the FAQ answer, whose panel stays mounted while
            // collapsed. Hovering the badge adds a second, which is the shared constant rendering
            // in both places rather than the wording being typed out twice.
            expect(copy()).toHaveLength(1)

            await userEvent.setup().hover(screen.getByText('Template'))

            await waitFor(() => expect(copy()).toHaveLength(2))
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
            renderWithProviders(
                <StudyCode studyId={study.id} dataPartnerName={DATA_PARTNER} previousHref={previousHref} />,
            )
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

            await user.click(screen.getByRole('radio', { name: /set main\.R as main file/i }))

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

            const { unmount } = renderWithProviders(
                <StudyCode studyId={study.id} dataPartnerName={DATA_PARTNER} previousHref={previousHref} />,
            )

            await waitFor(() => {
                expect(screen.getByText('main.R')).toBeInTheDocument()
            })

            unmount()

            renderWithProviders(
                <StudyCode studyId={study.id} dataPartnerName={DATA_PARTNER} previousHref={previousHref} />,
            )

            await waitFor(() => {
                expect(screen.getByText('main.R')).toBeInTheDocument()
            })

            const user = userEvent.setup()
            await user.click(screen.getByRole('radio', { name: /set main\.R as main file/i }))

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
