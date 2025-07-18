import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/tests/unit.helpers'
import OrgDashboardPage from './page'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'
import { faker } from '@faker-js/faker'
import { Org } from '@/schema/org'
import { fetchStudiesForOrgAction } from '@/server/actions/study.actions'
import { useUser } from '@clerk/nextjs'
import { UseUserReturn } from '@clerk/types'

vi.mock('@/server/actions/org.actions', () => ({
    getOrgFromSlugAction: vi.fn(),
}))

vi.mock('@/server/actions/study.actions', () => ({
    fetchStudiesForOrgAction: vi.fn(() => []),
}))

// TODO Extract out into a helper function that we can re-use
const mockOrg: Org = {
    id: faker.string.uuid(),
    slug: 'test-org',
    name: faker.company.name(),
    email: faker.internet.email({ provider: 'test.com' }),
    publicKey: 'fake-key',
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
}

beforeEach(() => {
    vi.mocked(useUser).mockReturnValue({
        user: {
            firstName: 'Tester',
        },
    } as UseUserReturn)
})

describe('Org Dashboard', () => {
    it('renders the welcome text', async () => {
        vi.mocked(fetchStudiesForOrgAction).mockResolvedValue([])
        vi.mocked(getOrgFromSlugAction).mockResolvedValue(mockOrg)

        const props = {
            params: Promise.resolve({ orgSlug: 'test-org' }),
        }

        renderWithProviders(await OrgDashboardPage(props))

        expect(screen.getByText(/Welcome to your SafeInsights dashboard!/i)).toBeDefined()
    })
})
