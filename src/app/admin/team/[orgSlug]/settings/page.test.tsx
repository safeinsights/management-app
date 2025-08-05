import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { mockSessionWithTestData, renderWithProviders } from '@/tests/unit.helpers'

import SettingsPage from './page'

describe('Admin Settings Page', () => {
    it('renders', async () => {
        const { org } = await mockSessionWithTestData({ isAdmin: true })

        const props = {
            params: Promise.resolve({ orgSlug: org.slug }),
        }

        renderWithProviders(await SettingsPage(props))

        expect(screen.getByText(/About organization/i)).toBeDefined()
    })
})
