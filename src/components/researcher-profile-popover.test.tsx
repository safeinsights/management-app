import {
    renderWithProviders,
    screen,
    waitFor,
    userEvent,
    faker,
    mockSessionWithTestData,
    insertTestStudyJobData,
    insertTestResearcherProfile,
} from '@/tests/unit.helpers'
import { describe, expect, it } from 'vitest'
import { ResearcherProfilePopover } from './researcher-profile-popover'

const renderAndHover = async (userId: string, studyId: string, orgSlug: string) => {
    const user = userEvent.setup()
    renderWithProviders(
        <ResearcherProfilePopover userId={userId} studyId={studyId} orgSlug={orgSlug} name="Hover target" />,
    )
    await user.hover(screen.getByText('Hover target'))
    return user
}

describe('ResearcherProfilePopover', () => {
    it('renders profile data after hover', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        await insertTestResearcherProfile({
            userId: user.id,
            education: { degree: 'Ph.D. in Computer Science' },
            positions: [{ affiliation: 'MIT', position: 'Professor', profileUrl: 'https://mit.edu/profile' }],
            researchDetails: { interests: ['Machine Learning', 'AI Ethics'] },
        })

        await renderAndHover(user.id, study.id, 'test-org')

        await waitFor(() => {
            expect(screen.getByText(`${user.firstName} ${user.lastName}`)).toBeInTheDocument()
        })
        expect(screen.getByText('MIT')).toBeInTheDocument()
        expect(screen.getByText('Ph.D. in Computer Science')).toBeInTheDocument()
        expect(screen.getByText('Professor')).toBeInTheDocument()
        expect(screen.getByText('Machine Learning')).toBeInTheDocument()
        expect(screen.getByText('AI Ethics')).toBeInTheDocument()
        expect(screen.getByText('View full profile')).toBeInTheDocument()
    })

    it('shows minimal popover with name and email when user has no profile', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        await renderAndHover(user.id, study.id, 'test-org')

        await waitFor(() => {
            expect(screen.getByText(`${user.firstName} ${user.lastName}`)).toBeInTheDocument()
        })
        expect(screen.getByText(user.email!)).toBeInTheDocument()
        expect(screen.getByText('This user has no detailed profile information')).toBeInTheDocument()
        expect(screen.queryByText('View full profile')).not.toBeInTheDocument()
    })

    it('shows "Profile not available" when user does not exist', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        await renderAndHover(faker.string.uuid(), study.id, 'test-org')

        await waitFor(() => {
            expect(screen.getByText('Profile not available')).toBeInTheDocument()
        })
    })

    it('shows "+ N more" link when researcher has multiple affiliations', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        await insertTestResearcherProfile({
            userId: user.id,
            positions: [
                { affiliation: 'MIT', position: 'Professor' },
                { affiliation: 'Stanford', position: 'Researcher' },
                { affiliation: 'Harvard', position: 'Lecturer' },
            ],
        })

        await renderAndHover(user.id, study.id, 'test-org')

        await waitFor(() => {
            expect(screen.getByText('+ 2 more current affiliation')).toBeInTheDocument()
        })
    })

    it('renders professional links when URLs are present', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        await insertTestResearcherProfile({
            userId: user.id,
            positions: [{ affiliation: 'MIT', position: 'Professor', profileUrl: 'https://mit.edu/profile' }],
            researchDetails: { detailedPublicationsUrl: 'https://scholar.google.com/user' },
        })

        await renderAndHover(user.id, study.id, 'test-org')

        await waitFor(() => {
            expect(screen.getByText('Professional links')).toBeInTheDocument()
        })
        expect(screen.getByText('University')).toBeInTheDocument()
        expect(screen.getByText('Publication list')).toBeInTheDocument()
    })

    it('renders "View full profile" link with correct href', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        await insertTestResearcherProfile({ userId: user.id })

        await renderAndHover(user.id, study.id, 'test-org')

        await waitFor(() => {
            const link = screen.getByText('View full profile')
            expect(link).toBeInTheDocument()
            expect(link.closest('a')).toHaveAttribute('href', `/test-org/study/${study.id}/researcher-profile`)
        })
    })
})
