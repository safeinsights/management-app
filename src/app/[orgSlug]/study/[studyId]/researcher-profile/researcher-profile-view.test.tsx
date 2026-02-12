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
            <ResearcherProfileView
                orgSlug={org.slug}
                studyId={faker.string.uuid()}
                profileData={profileData}
            />,
        )

        expect(screen.getByText('Personal information')).toBeDefined()

        expect(screen.queryByText('Highest level of education')).toBeNull()
        expect(screen.queryByText('Current institutional information')).toBeNull()
        expect(screen.queryByText('Research details')).toBeNull()
    })
})
