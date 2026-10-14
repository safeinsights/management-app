import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryRouter } from 'next-router-mock'
import { redirect, useParams } from 'next/navigation'
import { StudyRequestProvider } from '@/contexts/study-request'
import logger from '@/lib/logger'
import { Routes } from '@/lib/routes'
import {
    db,
    insertTestOrg,
    insertTestStudyJobData,
    insertTestUser,
    mockDualRoleSessionWithTestData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import StudyEditPage from './page'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

const renderRoute = (orgSlug: string, studyId: string, from?: string) =>
    StudyEditPage({ params: Promise.resolve({ orgSlug, studyId }), searchParams: Promise.resolve({ from }) })

const setupDraft = async () => {
    const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
    const { study } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        studyStatus: 'DRAFT',
        jobStatus: 'JOB-READY',
    })
    return { org, user, study }
}

const LEXICAL_BODY = JSON.stringify({ root: { children: [{ type: 'paragraph', children: [] }] } })

// StudyProposal calls useStudyRequest(); production wires that provider in the study layout,
// which this render does not exercise.
const renderPage = async (orgSlug: string, studyId: string, from?: string) => {
    const page = await renderRoute(orgSlug, studyId, from)
    renderWithProviders(<StudyRequestProvider submittingOrgSlug={orgSlug}>{page!}</StudyRequestProvider>)
}

describe('StudyEditPage', () => {
    it('renders the Step 1 form when the draft has no Step 2 fields populated', async () => {
        const { org, study } = await setupDraft()
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        await renderPage(org.slug, study.id)

        expect(mockRedirect).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: 'Save & continue' })).toBeInTheDocument()
    })

    // OTTER-764: a submitted study renders the same page as a read-only record, which is what gives
    // the researcher somewhere to step back to from the submitted proposal.
    it('renders Step 1 read-only for a submitted study', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
            title: 'A submitted study',
        })
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        await renderPage(org.slug, study.id)

        expect(screen.getByRole('button', { name: 'Next step' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { level: 1, name: 'A submitted study' })).toBeInTheDocument()
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Save & continue' })).not.toBeInTheDocument()
    })

    it('renders Step 1 read-only for a decided study', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'APPROVED',
        })
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        await renderPage(org.slug, study.id)

        expect(screen.getByRole('button', { name: 'Next step' })).toBeInTheDocument()
        expect(mockRedirect).not.toHaveBeenCalled()
    })

    it('shows the not-found message for a study that does not exist', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'lab' })

        const page = await renderRoute(org.slug, crypto.randomUUID())
        renderWithProviders(page!)

        expect(screen.getByText(/No such study exists/i)).toBeInTheDocument()
        expect(mockRedirect).not.toHaveBeenCalled()
    })

    // The page reads through getStudyAction now, so the soft-delete filter and the ability check it
    // carries apply here too.
    it('shows the not-found message for a soft-deleted study', async () => {
        const { org, study } = await setupDraft()
        await db.updateTable('study').set({ deletedAt: new Date() }).where('id', '=', study.id).execute()

        const page = await renderRoute(org.slug, study.id)
        renderWithProviders(page!)

        expect(screen.getByText(/No such study exists/i)).toBeInTheDocument()
    })

    // The other half of what getStudyAction brings, and the half that closes this page's
    // long-standing access TODO: a study submitted by a lab the session user does not belong to
    // fails `view Study` and is refused, where the page's own query used to render it.
    it('shows the not-found message for a study the session user has no ability to view', async () => {
        await mockSessionWithTestData({ orgType: 'lab' })
        // getStudyAction logs the denial before returning it, and the denial is the expected result
        // here rather than a fault, so keep it out of the run's error output.
        vi.spyOn(logger, 'error').mockImplementation(() => undefined)

        const otherLab = await insertTestOrg({ slug: `other-lab-${crypto.randomUUID().slice(0, 8)}`, type: 'lab' })
        const { user: otherResearcher } = await insertTestUser({ org: otherLab })
        const { study } = await insertTestStudyJobData({
            org: otherLab,
            researcherId: otherResearcher.id,
            studyStatus: 'PENDING-REVIEW',
            title: 'A study belonging to another lab',
        })

        const page = await renderRoute(otherLab.slug, study.id)
        renderWithProviders(page!)

        expect(screen.getByText(/No such study exists/i)).toBeInTheDocument()
        expect(screen.queryByText('A study belonging to another lab')).not.toBeInTheDocument()
    })

    // OTTER-764 review: getStudyAction only checks `view Study`, which the Data Partner's members
    // hold for every submitted study. Step 1 is the Research Lab's page, so they are moved on
    // rather than shown the researcher wizard.
    it('sends a Data Partner member to the review page', async () => {
        const { org: enclaveOrg } = await mockSessionWithTestData({ orgType: 'enclave' })
        const otherLab = await insertTestOrg({ slug: `other-lab-${crypto.randomUUID().slice(0, 8)}`, type: 'lab' })
        const { user: otherResearcher } = await insertTestUser({ org: otherLab })
        const { study } = await insertTestStudyJobData({
            org: enclaveOrg,
            submittedByOrg: otherLab,
            researcherId: otherResearcher.id,
            studyStatus: 'PENDING-REVIEW',
            title: 'A study under review',
        })

        await expect(renderRoute(enclaveOrg.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(Routes.studyReview({ orgSlug: enclaveOrg.slug, studyId: study.id }))
    })

    it('renders Step 1 for a dual-role user whose lab submitted the study', async () => {
        const { user, labOrg, enclaveOrg } = await mockDualRoleSessionWithTestData()
        const { study } = await insertTestStudyJobData({
            org: enclaveOrg,
            submittedByOrg: labOrg,
            researcherId: user.id,
            studyStatus: 'PENDING-REVIEW',
        })
        ;(useParams as Mock).mockReturnValue({ orgSlug: labOrg.slug, studyId: study.id })

        await renderPage(labOrg.slug, study.id)

        expect(mockRedirect).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: 'Next step' })).toBeInTheDocument()
    })

    // Idiom carried over from agreements/researcher: SI admins pass on `manage all`, as they do
    // everywhere else in the app.
    it('renders Step 1 for an SI admin who is not a member of the submitting lab', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const enclaveOrg = await insertTestOrg({ slug: `enclave-${crypto.randomUUID().slice(0, 8)}`, type: 'enclave' })
        const lab = await insertTestOrg({ slug: `lab-${crypto.randomUUID().slice(0, 8)}`, type: 'lab' })
        const { user: researcher } = await insertTestUser({ org: lab })
        const { study } = await insertTestStudyJobData({
            org: enclaveOrg,
            submittedByOrg: lab,
            researcherId: researcher.id,
            studyStatus: 'PENDING-REVIEW',
        })
        ;(useParams as Mock).mockReturnValue({ orgSlug: lab.slug, studyId: study.id })

        await renderPage(lab.slug, study.id)

        expect(mockRedirect).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: 'Next step' })).toBeInTheDocument()
    })

    it('steps forward to the submitted record', async () => {
        const user = userEvent.setup()
        const { org, user: researcher } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: researcher.id,
            studyStatus: 'PENDING-REVIEW',
            title: 'A submitted study',
        })
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
        memoryRouter.setCurrentUrl('/start')

        await renderPage(org.slug, study.id)
        await user.click(screen.getByRole('button', { name: 'Next step' }))

        await waitFor(() =>
            expect(memoryRouter.asPath).toBe(Routes.studySubmitted({ orgSlug: org.slug, studyId: study.id })),
        )
    })

    // OTTER-673: Edit proposal's "Previous step" lands here, and "Next step" has to return to Edit
    // proposal, not to the proposal status it was opened from.
    it.each([
        ['returns to Edit proposal when the step back came from it', 'CHANGE-REQUESTED', 'edit-proposal', 'edit'],
        ['steps forward to the submitted record without an origin', 'CHANGE-REQUESTED', undefined, 'submitted'],
        ['ignores an Edit proposal origin once the proposal is decided', 'APPROVED', 'edit-proposal', 'submitted'],
        ['ignores an origin it does not know', 'CHANGE-REQUESTED', 'dashboard', 'submitted'],
    ] as const)('%s', async (_name, studyStatus, from, target) => {
        const user = userEvent.setup()
        const { org, user: researcher } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: researcher.id, studyStatus })
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
        memoryRouter.setCurrentUrl('/start')

        await renderPage(org.slug, study.id, from)
        await user.click(screen.getByRole('button', { name: 'Next step' }))

        const params = { orgSlug: org.slug, studyId: study.id }
        const expected = target === 'edit' ? Routes.studyEditAndResubmit(params) : Routes.studySubmitted(params)
        await waitFor(() => expect(memoryRouter.asPath).toBe(expected))
    })

    // /edit is a revisitable step: it never resume-redirects to Step 2. resolveScreen, not this
    // page, decides the canonical screen.
    it('renders Step 1 even when the draft has Step 2 fields populated', async () => {
        const { org, study } = await setupDraft()
        const { user: piUser } = await insertTestUser({ org })
        await db
            .updateTable('study')
            .set({ piUserId: piUser.id, datasets: ['students'], researchQuestions: JSON.parse(LEXICAL_BODY) })
            .where('id', '=', study.id)
            .execute()
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        await renderPage(org.slug, study.id)

        expect(mockRedirect).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: 'Save & continue' })).toBeInTheDocument()
    })
})
