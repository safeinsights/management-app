import { describe, expect, it } from 'vitest'
import { faker } from '@faker-js/faker'
import { mockSessionWithTestData, renderWithProviders, screen } from '@/tests/unit.helpers'
import AcceptInvitePage from './page'

describe('AcceptInvitePage', () => {
    it('shows an inline invalid-invite panel for a signed-in user when the invite is missing or claimed', async () => {
        await mockSessionWithTestData()

        const page = await AcceptInvitePage({ params: Promise.resolve({ inviteId: faker.string.uuid() }) })
        renderWithProviders(page)

        expect(screen.getByText(/no longer valid/i)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /go to your dashboard/i })).toBeInTheDocument()
    })
})
