import { renderWithProviders, mockSessionWithTestData } from '@/tests/unit.helpers'
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { OrgAdminDashboardLink } from './org-admin-dashboard-link'
import { faker } from '@faker-js/faker'
import userEvent from '@testing-library/user-event'

describe('OrgAdminDashboardLink', () => {
    it('has all submenu URLs starting with /admin/', async () => {
        const orgSlug = faker.lorem.slug()
        // Mock session for an SI admin user to ensure all links are visible
        await mockSessionWithTestData({ orgSlug, isAdmin: true, isSiAdmin: true })

        renderWithProviders(<OrgAdminDashboardLink isVisible={true} />)

        // Click the Admin button to ensure the menu is open
        const adminButton = screen.getByRole('button', { name: /Admin/i })
        await userEvent.click(adminButton)

        // Get all the submenu links
        const siAdminDashboardLink = screen.getByRole('link', { name: 'SI Admin Dashboard' })
        const manageTeamLink = screen.getByRole('link', { name: 'Manage Team' })
        const settingsLink = screen.getByRole('link', { name: 'Settings' })

        // Assert that their href attributes start with /admin/
        expect(siAdminDashboardLink).toHaveAttribute('href', expect.stringMatching(/^\/admin\//))
        expect(manageTeamLink).toHaveAttribute('href', expect.stringMatching(/^\/admin\//))
        expect(settingsLink).toHaveAttribute('href', expect.stringMatching(/^\/admin\//))
    })
})
