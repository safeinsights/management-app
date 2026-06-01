import {
    db,
    insertTestUser,
    mockDualRoleSessionWithTestData,
    mockPathname,
    mockSessionWithTestData,
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
        .execute()

beforeEach(() => {
    mockPathname('/dashboard')
})

describe('UserStudiesDashboard', () => {
    it('keeps the toggle visible when the default researcher tab is empty and reviewer has rows', async () => {
        const { user, labOrg, enclaveOrg } = await mockDualRoleSessionWithTestData()
        // A study authored by someone else but assigned to our user as the reviewer: it
        // surfaces under Reviewer but not Researcher, so the default researcher tab is empty.
        const { user: otherResearcher } = await insertTestUser({ org: { ...labOrg, type: 'lab' } })
        await insertStudy({
            orgId: enclaveOrg.id,
            submittedByOrgId: labOrg.id,
            researcherId: otherResearcher.id,
            reviewerId: user.id,
            title: 'Reviewer Study',
        })

        renderWithProviders(<UserStudiesDashboard />)

        expect(await screen.findByText('My dashboard')).toBeDefined()
        expect(await screen.findByText('You have not started a study yet')).toBeDefined()
        expect(screen.getByRole('radio', { name: 'Reviewer' })).toBeDefined()
        expect(screen.getByRole('radio', { name: 'Researcher' })).toBeDefined()

        await userEvent.click(screen.getByRole('radio', { name: 'Reviewer' }))

        expect(await screen.findByText('Reviewer Study')).toBeDefined()
        expect(screen.getByRole('radio', { name: 'Reviewer' })).toBeDefined()
        expect(screen.getByRole('radio', { name: 'Researcher' })).toBeDefined()
    })

    it('keeps the toggle visible after switching from a populated researcher tab to an empty reviewer tab', async () => {
        const { user, labOrg, enclaveOrg } = await mockDualRoleSessionWithTestData()
        // Our user authored the study (Researcher tab) but is not assigned as a reviewer, so
        // the Reviewer tab is empty.
        await insertStudy({
            orgId: enclaveOrg.id,
            submittedByOrgId: labOrg.id,
            researcherId: user.id,
            title: 'Researcher Study',
        })

        renderWithProviders(<UserStudiesDashboard />)

        expect(await screen.findByText('Researcher Study')).toBeDefined()

        await userEvent.click(screen.getByRole('radio', { name: 'Reviewer' }))

        expect(await screen.findByText('You currently do not have any studies to review')).toBeDefined()
        expect(screen.getByRole('radio', { name: 'Reviewer' })).toBeDefined()
        expect(screen.getByRole('radio', { name: 'Researcher' })).toBeDefined()
    })

    it('does not show the toggle for a single-role researcher', async () => {
        await mockSessionWithTestData({ orgType: 'lab' })

        renderWithProviders(<UserStudiesDashboard />)

        expect(await screen.findByText('You have not started a study yet')).toBeDefined()
        expect(screen.queryByRole('radio', { name: 'Reviewer' })).toBeNull()
        expect(screen.queryByRole('radio', { name: 'Researcher' })).toBeNull()
    })

    it('does not show the toggle for a single-role reviewer', async () => {
        await mockSessionWithTestData({ orgType: 'enclave' })

        renderWithProviders(<UserStudiesDashboard />)

        expect(await screen.findByText('You currently do not have any studies to review')).toBeDefined()
        expect(screen.queryByRole('radio', { name: 'Reviewer' })).toBeNull()
        expect(screen.queryByRole('radio', { name: 'Researcher' })).toBeNull()
    })
})
