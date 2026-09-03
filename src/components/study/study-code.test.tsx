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

// isFirstVisit defaults false so the FAQ starts collapsed, which is the state most of these
// tests care nothing about. The page decides the real value; see code/page.test.tsx.
const renderIDE = async (
    studyOrgSlug = 'openstax-lab',
    files?: Record<string, string>,
    { dataPartnerName = DATA_PARTNER, isFirstVisit = false }: { dataPartnerName?: string; isFirstVisit?: boolean } = {},
) => {
    const { study } = await setupStudy(studyOrgSlug)
    if (files) {
        await insertTestBaselineJob(study.id, { createdAt: new Date(Date.now() - 1000) })
        const root = await createWorkspaceDir('study-code')
        workspaceRoots.push(root)
        await writeWorkspaceFiles(root, study.id, files)
    }
    const previousHref = `/test-org/study/${study.id}/agreements` as Route

    renderWithProviders(
        <StudyCode
            studyId={study.id}
            dataPartnerName={dataPartnerName}
            isFirstVisit={isFirstVisit}
            previousHref={previousHref}
        />,
    )

    return { study, previousHref, dataPartnerName }
}

const faqControl = () => screen.getByRole('button', { name: /New to SafeInsights IDE/ })

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

        it('opens expanded on a first visit', async () => {
            await renderIDE('openstax-lab', undefined, { isFirstVisit: true })

            expect(faqControl()).toHaveAttribute('aria-expanded', 'true')
        })

        it('opens collapsed on a return visit', async () => {
            await renderIDE('openstax-lab', undefined, { isFirstVisit: false })

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
            await renderIDE('openstax-lab', undefined, { isFirstVisit: true })

            const section = await screen.findByTestId(`faq-section-${question}`)
            expect(section).toHaveTextContent(question)
            expect(section).toHaveTextContent(answer)
        })

        it('interpolates the Data Partner into the answers that name them', async () => {
            await renderIDE('openstax-lab', undefined, { dataPartnerName: 'Rice University', isFirstVisit: true })

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
                <StudyCode
                    studyId={study.id}
                    dataPartnerName={DATA_PARTNER}
                    isFirstVisit={false}
                    previousHref={previousHref}
                />,
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

            const { unmount } = renderWithProviders(
                <StudyCode
                    studyId={study.id}
                    dataPartnerName={DATA_PARTNER}
                    isFirstVisit={false}
                    previousHref={previousHref}
                />,
            )

            await waitFor(() => {
                expect(screen.getByText('main.R')).toBeInTheDocument()
            })

            unmount()

            renderWithProviders(
                <StudyCode
                    studyId={study.id}
                    dataPartnerName={DATA_PARTNER}
                    isFirstVisit={false}
                    previousHref={previousHref}
                />,
            )

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
