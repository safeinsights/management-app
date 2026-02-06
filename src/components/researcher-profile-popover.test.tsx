import { getResearcherProfileByUserIdAction } from '@/server/actions/researcher-profile.actions'
import {
    renderWithProviders,
    screen,
    waitFor,
    userEvent,
    mockSessionWithTestData,
    insertTestStudyJobData,
    insertTestResearcherProfile,
} from '@/tests/unit.helpers'
import { describe, expect, it, vi } from 'vitest'
import { ResearcherProfilePopover } from './researcher-profile-popover'

vi.mock('@/server/actions/researcher-profile.actions', () => ({
    getResearcherProfileByUserIdAction: vi.fn(),
}))

const mockGetProfile = vi.mocked(getResearcherProfileByUserIdAction)

const renderAndHover = async (userId: string, studyId: string, orgSlug: string) => {
    const user = userEvent.setup()
    renderWithProviders(
        <ResearcherProfilePopover userId={userId} studyId={studyId} orgSlug={orgSlug}>
            <button>Hover target</button>
        </ResearcherProfilePopover>,
    )
    await user.hover(screen.getByText('Hover target'))
    return user
}

describe('ResearcherProfilePopover', () => {
    it('renders the hover target', async () => {
        await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })

        mockGetProfile.mockImplementation(() => new Promise(() => {}))

        renderWithProviders(
            <ResearcherProfilePopover userId="user-1" studyId="study-1" orgSlug="test-org">
                <button>Hover target</button>
            </ResearcherProfilePopover>,
        )

        expect(screen.getByText('Hover target')).toBeInTheDocument()
    })

    it('renders profile data after hover', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        await insertTestResearcherProfile({
            userId: user.id,
            education: { degree: 'Ph.D. in Computer Science' },
            positions: [{ affiliation: 'MIT', position: 'Professor', profileUrl: 'https://mit.edu/profile' }],
            researchDetails: { interests: ['Machine Learning', 'AI Ethics'] },
        })

        mockGetProfile.mockResolvedValue({
            user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email },
            profile: {
                userId: user.id,
                educationInstitution: null,
                educationDegree: 'Ph.D. in Computer Science',
                educationFieldOfStudy: null,
                educationIsCurrentlyPursuing: false,
                researchInterests: ['Machine Learning', 'AI Ethics'],
                detailedPublicationsUrl: null,
                featuredPublicationsUrls: [],
            },
            positions: [
                {
                    id: 'pos-1',
                    affiliation: 'MIT',
                    position: 'Professor',
                    profileUrl: 'https://mit.edu/profile',
                    sortOrder: 0,
                },
            ],
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

    it('shows "Profile not available" when no data', async () => {
        await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })

        mockGetProfile.mockResolvedValue(null)

        await renderAndHover('user-1', 'study-1', 'test-org')

        await waitFor(() => {
            expect(screen.getByText('Profile not available')).toBeInTheDocument()
        })
    })

    it('renders "View full profile" link with correct href', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-org', orgType: 'enclave' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        mockGetProfile.mockResolvedValue({
            user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email },
            profile: {
                userId: user.id,
                educationInstitution: null,
                educationDegree: null,
                educationFieldOfStudy: null,
                educationIsCurrentlyPursuing: false,
                researchInterests: [],
                detailedPublicationsUrl: null,
                featuredPublicationsUrls: [],
            },
            positions: [],
        })

        await renderAndHover(user.id, study.id, 'test-org')

        await waitFor(() => {
            const link = screen.getByText('View full profile')
            expect(link).toBeInTheDocument()
            expect(link.closest('a')).toHaveAttribute('href', `/test-org/study/${study.id}/researcher-profile`)
        })
    })
})
