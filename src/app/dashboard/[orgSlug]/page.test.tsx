import { Org } from '@/schema/org'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'
import { fetchStudiesForOrgAction } from '@/server/actions/study.actions'
import { renderWithProviders } from '@/tests/unit.helpers'
import { useUser } from '@clerk/nextjs'
import { UseUserReturn } from '@clerk/types'
import { faker } from '@faker-js/faker'
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrgDashboardPage from './page'

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
    type: 'enclave',
    settings: { publicKey: 'fake-key' },
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

        expect(screen.getByText(/Welcome to your dashboard./i)).toBeDefined()
    })
})
