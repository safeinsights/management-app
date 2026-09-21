import { describe, expect, faker, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { ProfessionalProfileLink } from './professional-profile-link'

const ORG_SLUG = 'test-org'

describe('ProfessionalProfileLink', () => {
    const studyId = faker.string.uuid()
    const userId = faker.string.uuid()

    it('links to the researcher profile page for the given user', () => {
        renderWithProviders(<ProfessionalProfileLink userId={userId} studyId={studyId} orgSlug={ORG_SLUG} />)

        const link = screen.getByRole('link', { name: /Professional profile/ })
        expect(link).toHaveAttribute('href', `/${ORG_SLUG}/study/${studyId}/researcher-profile?userId=${userId}`)
    })

    it('opens in a new tab without granting it access to this window', () => {
        renderWithProviders(<ProfessionalProfileLink userId={userId} studyId={studyId} orgSlug={ORG_SLUG} />)

        const link = screen.getByRole('link', { name: /Professional profile/ })
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('renders nothing when no user is recorded', () => {
        renderWithProviders(<ProfessionalProfileLink userId={null} studyId={studyId} orgSlug={ORG_SLUG} />)

        expect(screen.queryByRole('link')).not.toBeInTheDocument()
        expect(screen.queryByText(/Professional profile/)).not.toBeInTheDocument()
    })
})
