import {
    db,
    insertTestUser,
    mockDualRoleSessionWithTestData,
    mockPathname,
    mockSessionWithTestData,
    pageHeaderEyebrow,
    renderWithProviders,
    screen,
    userEvent,
    beforeEach,
    describe,
    expect,
    it,
} from '@/tests/unit.helpers'
import UserStudiesDashboard from './user-studies'

type InsertStudyOptions = {
    orgId: string
    submittedByOrgId: string
    researcherId: string
    reviewerId?: string | null
    title: string
}

const insertStudy = ({ orgId, submittedByOrgId, researcherId, reviewerId = null, title }: InsertStudyOptions) =>
    db
        .insertInto('study')
        .values({
            orgId,
            submittedByOrgId,
            researcherId,
            reviewerId,
            containerLocation: 'test-container',
            title,
            piName: 'PI',
            status: 'PENDING-REVIEW',
            dataSources: ['all'],
            outputMimeType: 'text/csv',
            language: 'R',
            submittedAt: new Date(),
        })
        .returning('id')
        .executeTakeFirstOrThrow()

beforeEach(() => {
    mockPathname('/dashboard')
})

describe('UserStudiesDashboard', () => {
    // My studies lists the reviewer's own decisions, so the fixture records one.
    const decidedStudy = async ({
        reviewerId,
        labOrgId,
        enclaveOrgId,
        researcherId,
    }: {
        reviewerId: string
        labOrgId: string
        enclaveOrgId: string
        researcherId: string
    }) => {
        const study = await insertStudy({
            orgId: enclaveOrgId,
            submittedByOrgId: labOrgId,
            researcherId,
            title: 'Reviewer Study',
        })
        const job = await db
            .insertInto('studyJob')
            .values({ studyId: study.id })
            .returning('id')
            .executeTakeFirstOrThrow()
        await db
            .insertInto('jobStatusChange')
            .values({ studyJobId: job.id, userId: reviewerId, status: 'CODE-APPROVED' })
            .execute()
    }

    it('opens on the Reviewer tab for a dual-role user, with the switcher outside the card', async () => {
        const { user, labOrg, enclaveOrg } = await mockDualRoleSessionWithTestData()
        const { user: otherResearcher } = await insertTestUser({ org: { ...labOrg, type: 'lab' } })
        await decidedStudy({
            reviewerId: user.id,
            labOrgId: labOrg.id,
            enclaveOrgId: enclaveOrg.id,
            researcherId: otherResearcher.id,
        })

        renderWithProviders(<UserStudiesDashboard />)

        expect(await screen.findByRole('link', { name: 'Reviewer Study' })).toBeDefined()
        expect(screen.getByRole('radio', { name: 'Reviewer' })).toBeChecked()
        expect(screen.getByText('Studies for review')).toBeDefined()
        const card = screen.getByText('Studies for review').closest('.mantine-Paper-root') as HTMLElement
        expect(card.contains(screen.getByRole('radio', { name: 'Reviewer' }))).toBe(false)
    })

    it('swaps the title, columns and empty copy when switching to Researcher', async () => {
        await mockDualRoleSessionWithTestData()

        renderWithProviders(<UserStudiesDashboard />)

        expect(await screen.findByText(/Studies require your review at three stages/)).toBeDefined()

        await userEvent.click(screen.getByRole('radio', { name: 'Researcher' }))

        expect(await screen.findByText(/Every study follows four steps/)).toBeDefined()
        expect(screen.getByText('All studies')).toBeDefined()
        expect(screen.getByRole('columnheader', { name: /Submitted to/ })).toBeDefined()
        expect(screen.getByRole('radio', { name: 'Researcher' })).toBeChecked()
    })

    it('restores the tab named in the URL', async () => {
        const { user, labOrg, enclaveOrg } = await mockDualRoleSessionWithTestData()
        await insertStudy({
            orgId: enclaveOrg.id,
            submittedByOrgId: labOrg.id,
            researcherId: user.id,
            title: 'Researcher Study',
        })
        mockPathname('/dashboard?audience=researcher')

        renderWithProviders(<UserStudiesDashboard />)

        expect(await screen.findByRole('link', { name: 'Researcher Study' })).toBeDefined()
        expect(screen.getByRole('radio', { name: 'Researcher' })).toBeChecked()
    })

    // Category 3 (OTTER-619): no eyebrow, and the reserved slot must announce nothing.
    it('heads the page with no eyebrow above it', async () => {
        await mockDualRoleSessionWithTestData()

        renderWithProviders(<UserStudiesDashboard />)

        expect(await screen.findByRole('heading', { level: 1, name: 'My studies' })).toBeInTheDocument()
        expect(pageHeaderEyebrow()).toBe('')
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    })

    it('does not show the toggle for a single-role researcher', async () => {
        await mockSessionWithTestData({ orgType: 'lab' })

        renderWithProviders(<UserStudiesDashboard />)

        expect(await screen.findByText(/Every study follows four steps/)).toBeDefined()
        expect(screen.queryByRole('radio', { name: 'Reviewer' })).toBeNull()
        expect(screen.queryByRole('radio', { name: 'Researcher' })).toBeNull()
    })

    it('does not show the toggle for a single-role reviewer', async () => {
        await mockSessionWithTestData({ orgType: 'enclave' })

        renderWithProviders(<UserStudiesDashboard />)

        expect(await screen.findByText(/Studies require your review at three stages/)).toBeDefined()
        expect(screen.queryByRole('radio', { name: 'Reviewer' })).toBeNull()
        expect(screen.queryByRole('radio', { name: 'Researcher' })).toBeNull()
    })
})
