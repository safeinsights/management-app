import {
    afterEach,
    beforeEach,
    cleanupWorkspaceDirs,
    createWorkspaceDir,
    db,
    describe,
    expect,
    expectStudyJobRecords,
    insertTestCodeEnv,
    it,
    insertTestStudyOnly,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
    writeWorkspaceFiles,
} from '@/tests/unit.helpers'
import { StudyCode } from './study-code'
import { notifications } from '@mantine/notifications'
import type { Route } from 'next'
import { vi } from 'vitest'
import { signedUrlForFile } from '@/server/aws'

vi.mock('@/server/aws', async () => {
    const actual = await vi.importActual('@/server/aws')
    return {
        ...actual,
        storeS3File: vi.fn(),
        triggerScanForStudyJob: vi.fn(),
        createSignedUploadUrl: vi.fn().mockResolvedValue('https://mock-s3-url.example.com'),
        signedUrlForFile: vi.fn().mockResolvedValue('https://mock-s3-url.example.com/starter.R'),
    }
})

const workspaceRoots: string[] = []

const setupStudy = async (orgSlug = 'openstax-lab') => {
    const { org, user } = await mockSessionWithTestData({ orgSlug, orgType: 'lab' })
    const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
    return { org, user, study }
}

const createBaselineJob = async (studyId: string, { backdate = true }: { backdate?: boolean } = {}) => {
    const createdAt = backdate ? new Date(Date.now() - 1000) : new Date(Date.now() + 1000)
    const job = await db
        .insertInto('studyJob')
        .values({ studyId, createdAt })
        .returning(['id', 'createdAt'])
        .executeTakeFirstOrThrow()
    await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'INITIATED' }).executeTakeFirstOrThrow()
    return job
}

const renderIDE = async (studyOrgSlug = 'openstax-lab', files?: Record<string, string>) => {
    const { study } = await setupStudy(studyOrgSlug)
    if (files) {
        await createBaselineJob(study.id)
        const root = await createWorkspaceDir('study-code')
        workspaceRoots.push(root)
        await writeWorkspaceFiles(root, study.id, files)
    }
    const previousHref = `/test-org/study/${study.id}/agreements` as Route

    renderWithProviders(<StudyCode studyId={study.id} studyTitle={study.title} previousHref={previousHref} />)

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

    it('renders workspace files with no main file selected by default', async () => {
        await renderIDE('openstax-lab', {
            'main.r': 'print("main")',
            'helper.r': 'print("helper")',
        })

        await waitFor(() => {
            expect(screen.getByText('main.r')).toBeInTheDocument()
            expect(screen.getByText('helper.r')).toBeInTheDocument()
            expect(screen.getByRole('button', { name: /submit code/i })).toBeDisabled()
        })

        expect(screen.getByText('Main file')).toBeInTheDocument()
        expect(screen.getByText('File name')).toBeInTheDocument()

        const stars = screen.getAllByRole('radio')
        expect(stars).toHaveLength(2)
        expect(stars[0]).toHaveAttribute('aria-checked', 'false')
        expect(stars[1]).toHaveAttribute('aria-checked', 'false')
    })

    it('selects a main file when the star is clicked', async () => {
        const user = userEvent.setup()
        await renderIDE('openstax-lab', {
            'main.r': 'print("main")',
            'helper.r': 'print("helper")',
        })

        await waitFor(() => {
            expect(screen.getByText('helper.r')).toBeInTheDocument()
        })

        const stars = screen.getAllByRole('radio')
        await user.click(stars[0])
        expect(stars[0]).toHaveAttribute('aria-checked', 'true')
        expect(screen.getByRole('button', { name: /submit code/i })).toBeEnabled()
    })

    it('shows the Launch IDE button for all orgs', async () => {
        await renderIDE('some-other-org')

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /launch ide/i })).toBeInTheDocument()
        })
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

        await user.click(screen.getByRole('radio', { name: /Main file: main\.R/i })) // select main.R as main file

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
            { name: 'main.R', fileType: 'MAIN-CODE' },
            { name: 'helper.R', fileType: 'SUPPLEMENTAL-CODE' },
        ])

        expect(notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({ color: 'green', title: 'Study Code Submitted' }),
        )
    })

    it('submits a single file as main', async () => {
        const user = userEvent.setup()
        const { study } = await renderIDE('openstax-lab', {
            'analysis.r': 'print("only")',
        })

        await waitFor(() => {
            expect(screen.getByText('analysis.r')).toBeInTheDocument()
        })

        const stars = screen.getAllByRole('radio')
        await user.click(stars[0])

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

        await expectStudyJobRecords(study.id, [{ name: 'analysis.r', fileType: 'MAIN-CODE' }])
    })

    it('renders the page chrome and previous link', async () => {
        const { previousHref } = await renderIDE()

        await waitFor(() => {
            expect(screen.getByText('STEP 4 of 4')).toBeInTheDocument()
            expect(screen.getByText('Study code')).toBeInTheDocument()
        })

        const previousLink = screen.getByRole('link', { name: /previous/i })
        expect(previousLink).toHaveAttribute('href', previousHref)
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
                await createBaselineJob(study.id, { backdate })
                const root = await createWorkspaceDir('study-code')
                workspaceRoots.push(root)
                await writeWorkspaceFiles(root, study.id, files)
            }
            const previousHref = `/test-org/study/${study.id}/agreements` as Route
            renderWithProviders(<StudyCode studyId={study.id} studyTitle={study.title} previousHref={previousHref} />)
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
            const user = userEvent.setup()
            await renderWithCodeEnv({ 'main.R': 'print("starter")' }, { backdate: false })

            await waitFor(() => {
                expect(screen.getAllByText('main.R').length).toBeGreaterThan(0)
            })

            const stars = screen.getAllByRole('radio')
            await user.click(stars[0])

            await waitFor(() => {
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

            const stars = screen.getAllByRole('radio')
            await user.click(stars[0])

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /submit code/i })).toBeEnabled()
            })
        })
    })

    describe('session timeout regression', () => {
        it('submits successfully after unmount and fresh remount with same studyId', async () => {
            const orgSlug = 'openstax-lab'
            const { study } = await setupStudy(orgSlug)
            await createBaselineJob(study.id)
            const root = await createWorkspaceDir('study-code')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, {
                'main.R': 'print("main")',
                'helper.R': 'print("helper")',
            })
            const previousHref = `/test-org/study/${study.id}/agreements` as Route

            const { unmount } = renderWithProviders(
                <StudyCode studyId={study.id} studyTitle={study.title} previousHref={previousHref} />,
            )

            await waitFor(() => {
                expect(screen.getByText('main.R')).toBeInTheDocument()
            })

            unmount()

            renderWithProviders(<StudyCode studyId={study.id} studyTitle={study.title} previousHref={previousHref} />)

            await waitFor(() => {
                expect(screen.getByText('main.R')).toBeInTheDocument()
            })

            const user = userEvent.setup()
            await user.click(screen.getByRole('radio', { name: /Main file: main\.R/i }))

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
                { name: 'main.R', fileType: 'MAIN-CODE' },
                { name: 'helper.R', fileType: 'SUPPLEMENTAL-CODE' },
            ])

            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({ color: 'green', title: 'Study Code Submitted' }),
            )
        })
    })
})
