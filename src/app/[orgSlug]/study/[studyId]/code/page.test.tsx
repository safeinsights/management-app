import { beforeEach, describe, it, expect, vi } from 'vitest'
import { redirect } from 'next/navigation'
import {
    afterEach,
    cleanupWorkspaceDirs,
    createWorkspaceDir,
    db,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    setTestStudyStatus,
    waitFor,
    waitForPendingMutations,
    within,
    writeWorkspaceFiles,
} from '@/tests/unit.helpers'
import type { StudyJobStatus } from '@/database/types'
import { memoryRouter } from 'next-router-mock'
import StudyCodeUploadRoute from './page'
import { SUBMIT_CODE_FAQ_SUBJECT } from '@/lib/audit-subjects'

const mockRedirect = vi.mocked(redirect)

const realFetch = globalThis.fetch
const stubVimeoDuration = (seconds: number) =>
    vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation((input, init) =>
            String(input).startsWith('https://vimeo.com/api/oembed.json')
                ? Promise.resolve(Response.json({ duration: seconds }))
                : realFetch(input, init),
        )

beforeEach(() => {
    memoryRouter.setCurrentUrl('/')
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
    stubVimeoDuration(600)
})

const renderRoute = async (orgSlug: string, studyId: string) => {
    const page = await StudyCodeUploadRoute({
        params: Promise.resolve({ orgSlug, studyId }),
    })
    const rendered = renderWithProviders(page!)
    // The FAQ records a first visit on mount, and teardown fails on a write still in flight.
    await waitForPendingMutations()
    return rendered
}

describe('StudyCodeUploadRoute', () => {
    it('renders code upload page for DRAFT study and previous links to edit', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'DRAFT',
        })

        await renderRoute(org.slug, study.id)

        expect(screen.getByText('STEP 3')).toBeInTheDocument()
        expect(screen.getByTestId('video-duration-badge')).toHaveTextContent('10 min video')

        const previousLink = screen.getByRole('link', { name: /previous/i })
        expect(previousLink).toHaveAttribute('href', expect.stringContaining('/edit'))
    })

    it('routes approved study previous button to the submitted proposal', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
        })

        await renderRoute(org.slug, study.id)

        const previousLink = screen.getByRole('link', { name: /previous/i })
        expect(previousLink).toHaveAttribute('href', expect.stringContaining('/submitted'))
    })

    it('redirects to view for non-DRAFT/APPROVED study', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
        })
        await setTestStudyStatus(study.id, 'PENDING-REVIEW')

        await expect(
            StudyCodeUploadRoute({
                params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
            }),
        ).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/view'))
    })

    it('shows empty state when no workspace files exist', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'DRAFT',
        })

        await renderRoute(org.slug, study.id)

        // The submit button stays clickable; OTTER-693 validates on click instead of gating it.
        await waitFor(() => {
            expect(within(screen.getByTestId('submit-row')).getByRole('button', { name: /submit code/i })).toBeEnabled()
        })
    })

    // QA rejected OTTER-693 because reopening /code after submitting left the page fully live: the
    // star persisted a change and Submit completed a second submission.
    describe('view-only once the round is submitted (OTTER-693)', () => {
        const workspaceRoots: string[] = []
        afterEach(() => cleanupWorkspaceDirs(workspaceRoots))

        const seedWithFiles = async (jobStatus: StudyJobStatus) => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const { study } = await insertTestStudyJobData({
                org,
                researcherId: user.id,
                studyStatus: 'APPROVED',
                jobStatus,
            })
            const root = await createWorkspaceDir('code-page-view-only')
            workspaceRoots.push(root)
            await writeWorkspaceFiles(root, study.id, { 'analysis.R': 'print(1)' })
            return { org, study }
        }

        const submitButton = () => screen.queryByRole('button', { name: /submit code for review/i })
        const starFor = (fileName: string) => screen.getByRole('radio', { name: new RegExp(fileName, 'i') })

        it('renders the table read-only and drops every way to change the code', async () => {
            const { org, study } = await seedWithFiles('CODE-SUBMITTED')

            await renderRoute(org.slug, study.id)

            await waitFor(() => expect(starFor('analysis.R')).toBeInTheDocument())
            expect(starFor('analysis.R')).toBeDisabled()
            expect(screen.getByRole('button', { name: /delete analysis\.R/i })).toBeDisabled()
            expect(screen.getByRole('button', { name: /edit analysis\.R in IDE/i })).toBeDisabled()
            expect(submitButton()).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: /launch ide/i })).not.toBeInTheDocument()
            expect(screen.queryByText(/already have code/i)).not.toBeInTheDocument()
            // Hiding the link is not enough: a drag onto the table bypasses it entirely.
            expect(screen.getByTestId('file-drop-zone')).toHaveAttribute('data-disabled')

            // Reading the code back is the point of a view-only page, so these stay live.
            expect(screen.getByRole('button', { name: /view analysis\.R/i })).toBeEnabled()
            expect(screen.getByRole('button', { name: /download analysis\.R/i })).toBeEnabled()
        })

        // The positive half, so the assertions above cannot pass against a page that failed to render.
        it('leaves all of it live before the first submission', async () => {
            const { org, study } = await seedWithFiles('INITIATED')

            await renderRoute(org.slug, study.id)

            await waitFor(() => expect(starFor('analysis.R')).toBeInTheDocument())
            expect(starFor('analysis.R')).toBeEnabled()
            expect(submitButton()).toBeInTheDocument()
            expect(screen.getByText(/already have code/i)).toBeInTheDocument()
        })

        // The preload mints a round job, so a view-only visit must not open one.
        it('opens no round job on a view-only visit', async () => {
            const { org, study } = await seedWithFiles('CODE-SUBMITTED')
            const before = await db.selectFrom('studyJob').select('id').where('studyId', '=', study.id).execute()

            await renderRoute(org.slug, study.id)

            const after = await db.selectFrom('studyJob').select('id').where('studyId', '=', study.id).execute()
            expect(after).toHaveLength(before.length)
        })
    })

    // The component tests drive expanded/collapsed off a prop; these own where the prop comes from —
    // an audit record that has to outlive the render and belong to the researcher, not the study.
    describe('FAQ first-visit detection (OTTER-693)', () => {
        const faqControl = () => screen.getByRole('button', { name: /New to SafeInsights IDE/ })

        const viewedCount = async (userId: string) => {
            const rows = await db
                .selectFrom('audit')
                .select('id')
                .where('recordType', '=', 'USER')
                .where('eventType', '=', 'VIEWED')
                .where('recordId', '=', userId)
                .execute()
            return rows.length
        }

        type TestOrg = NonNullable<Parameters<typeof insertTestStudyJobData>[0]>['org']

        const seedDraft = async (org: TestOrg, userId: string) => {
            const { study } = await insertTestStudyJobData({ org, researcherId: userId, studyStatus: 'DRAFT' })
            return study
        }

        it('expands for a researcher who has never seen it, and records the view', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const study = await seedDraft(org, user.id)

            expect(await viewedCount(user.id)).toBe(0)

            await renderRoute(org.slug, study.id)
            expect(faqControl()).toHaveAttribute('aria-expanded', 'true')

            await waitFor(async () => expect(await viewedCount(user.id)).toBe(1))
        })

        it('collapses once the view has been recorded', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const study = await seedDraft(org, user.id)
            await db
                .insertInto('audit')
                .values({
                    userId: user.id,
                    eventType: 'VIEWED',
                    recordType: 'USER',
                    recordId: user.id,
                    metadata: { subject: SUBMIT_CODE_FAQ_SUBJECT },
                })
                .execute()

            await renderRoute(org.slug, study.id)

            expect(faqControl()).toHaveAttribute('aria-expanded', 'false')
        })

        it('ignores a VIEWED event recorded for something else', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const study = await seedDraft(org, user.id)
            // The event type is shared, so the subject is what keeps features apart.
            await db
                .insertInto('audit')
                .values({
                    userId: user.id,
                    eventType: 'VIEWED',
                    recordType: 'USER',
                    recordId: user.id,
                    metadata: { subject: 'SOMETHING_ELSE' },
                })
                .execute()

            await renderRoute(org.slug, study.id)

            expect(faqControl()).toHaveAttribute('aria-expanded', 'true')
        })

        it('is scoped to the researcher, not the study', async () => {
            const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
            const first = await seedDraft(org, user.id)
            const second = await seedDraft(org, user.id)

            const firstView = await renderRoute(org.slug, first.id)
            expect(faqControl()).toHaveAttribute('aria-expanded', 'true')
            await waitFor(async () => expect(await viewedCount(user.id)).toBe(1))
            firstView.unmount()

            await renderRoute(org.slug, second.id)
            expect(faqControl()).toHaveAttribute('aria-expanded', 'false')
        })
    })
})
