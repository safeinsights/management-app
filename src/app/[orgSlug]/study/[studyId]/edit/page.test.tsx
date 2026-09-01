import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    type Mock,
} from '@/tests/unit.helpers'
import StudyEditPage from './page'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

const renderRoute = (orgSlug: string, studyId: string, searchParams: Record<string, string | undefined> = {}) =>
    StudyEditPage({ params: Promise.resolve({ orgSlug, studyId }), searchParams: Promise.resolve(searchParams) })

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

// insertTestStudyJobData points orgId and submittedByOrgId at one org, which cannot express a
// Data Partner reviewing another lab's study. OTTER-768 adds a fixture option for this.
const insertSubmittedStudyFor = async (
    enclaveOrgId: string,
    submittedByOrgId: string,
    researcherId: string,
    title: string,
) =>
    await db
        .insertInto('study')
        .values({
            orgId: enclaveOrgId,
            submittedByOrgId,
            containerLocation: 'test-container',
            title,
            researcherId,
            piName: 'test',
            status: 'PENDING-REVIEW',
            submittedAt: new Date(),
            dataSources: ['all'],
            outputMimeType: 'application/zip',
            language: 'R',
        })
        .returning('id')
        .executeTakeFirstOrThrow()

// StudyProposal calls useStudyRequest(); production wires that provider in the study layout,
// which this render does not exercise.
const renderPage = async (orgSlug: string, studyId: string, searchParams: Record<string, string | undefined> = {}) => {
    const page = await renderRoute(orgSlug, studyId, searchParams)
    renderWithProviders(<StudyRequestProvider submittingOrgSlug={orgSlug}>{page!}</StudyRequestProvider>)
}

describe('StudyEditPage', () => {
    it('renders the Step 1 form when the draft has no Step 2 fields populated', async () => {
        const { org, study } = await setupDraft()
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        await renderPage(org.slug, study.id)

        expect(mockRedirect).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: 'Save and continue' })).toBeInTheDocument()
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
        expect(screen.getByText('A submitted study')).toBeInTheDocument()
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Save and continue' })).not.toBeInTheDocument()
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
        const study = await insertSubmittedStudyFor(
            enclaveOrg.id,
            otherLab.id,
            otherResearcher.id,
            'A study under review',
        )

        await expect(renderRoute(enclaveOrg.slug, study.id)).rejects.toThrow('NEXT_REDIRECT')

        expect(mockRedirect).toHaveBeenCalledWith(Routes.studyReview({ orgSlug: enclaveOrg.slug, studyId: study.id }))
    })

    it('renders Step 1 for a dual-role user whose lab submitted the study', async () => {
        const { user, labOrg, enclaveOrg } = await mockDualRoleSessionWithTestData()
        const study = await insertSubmittedStudyFor(enclaveOrg.id, labOrg.id, user.id, 'A dual-role study')
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
        const study = await insertSubmittedStudyFor(enclaveOrg.id, lab.id, researcher.id, 'An SI admin study')
        ;(useParams as Mock).mockReturnValue({ orgSlug: lab.slug, studyId: study.id })

        await renderPage(lab.slug, study.id)

        expect(mockRedirect).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: 'Next step' })).toBeInTheDocument()
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
        expect(screen.getByRole('button', { name: 'Save and continue' })).toBeInTheDocument()
    })
})
