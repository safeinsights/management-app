import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { faker } from '@faker-js/faker'
import {
    renderWithProviders,
    mockSessionWithTestData,
    insertTestResearcherProfile,
    getTestResearcherProfileData,
} from '@/tests/unit.helpers'
import { ResearcherProfileView } from './researcher-profile-view'

describe('ResearcherProfileView', () => {
    it('should hide sections with no data in read-only mode', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({ userId: user.id })

        const profileData = await getTestResearcherProfileData(user.id)

        renderWithProviders(
            <ResearcherProfileView orgSlug={org.slug} studyId={faker.string.uuid()} profileData={profileData} />,
        )

        expect(screen.getByText('Personal information')).toBeInTheDocument()

        expect(screen.queryByText('Highest level of education')).toBeNull()
        expect(screen.queryByText('Current institutional information')).toBeNull()
        expect(screen.queryByText('Research details')).toBeNull()
    })

    it('should show all sections when profile has complete data', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({
            userId: user.id,
            education: { degree: 'Ph.D.', institution: 'MIT', fieldOfStudy: 'Computer Science' },
            positions: [{ affiliation: 'Stanford', position: 'Professor' }],
            researchDetails: { interests: ['AI'] },
        })

        const profileData = await getTestResearcherProfileData(user.id)

        renderWithProviders(
            <ResearcherProfileView orgSlug={org.slug} studyId={faker.string.uuid()} profileData={profileData} />,
        )

        expect(screen.getByText('Personal information')).toBeInTheDocument()
        expect(screen.getByText('Highest level of education')).toBeInTheDocument()
        expect(screen.getByText('Current institutional information')).toBeInTheDocument()
        expect(screen.getByText('Research details')).toBeInTheDocument()
    })

    it('should render "Back to study proposal" link with correct href', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({ userId: user.id })

        const profileData = await getTestResearcherProfileData(user.id)
        const studyId = faker.string.uuid()

        renderWithProviders(<ResearcherProfileView orgSlug={org.slug} studyId={studyId} profileData={profileData} />)

        const link = screen.getByText('Back to study proposal')
        expect(link).toBeInTheDocument()
        expect(link.closest('a')).toHaveAttribute('href', `/${org.slug}/study/${studyId}/review`)
    })
})
