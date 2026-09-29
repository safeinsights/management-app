import { Org } from '@/schema/org'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'
import { fetchStudiesForOrgAction } from '@/server/actions/study.actions'
import { pageHeaderEyebrow, renderWithProviders } from '@/tests/unit.helpers'
import { useUser } from '@clerk/nextjs'
import { UseUserReturn } from '@clerk/types'
import { faker } from '@faker-js/faker'
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrgDashboardPage from './page'

vi.mock('@/server/actions/org.actions', async () => {
    return {
        getOrgFromSlugAction: vi.fn(),
    }
})

vi.mock('@/server/actions/study.actions', () => ({
    fetchStudiesForOrgAction: vi.fn(() => []),
}))

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
        isLoaded: true,
        isSignedIn: true,
        user: {
            id: 'test-clerk-user-id',
            firstName: 'Tester',
            publicMetadata: {
                format: 'v3',
                user: { id: 'test-user-id' },
                teams: null,
                orgs: {
                    'test-org': {
                        id: 'test-org-id',
                        slug: 'test-org',
                        type: 'enclave',
                        isAdmin: false,
                    },
                },
            },
            unsafeMetadata: {
                currentOrgSlug: 'test-org',
            },
        },
    } as unknown as UseUserReturn)
})

// The route org, not the viewer's: this session belongs to test-org while the page is asked for
// another org's dashboard (OTTER-619).
const routeOrg: Org = { ...mockOrg, id: faker.string.uuid(), slug: 'other-org', name: 'Mars University Lab' }

describe('Org Dashboard', () => {
    it('renders the welcome text', async () => {
        vi.mocked(fetchStudiesForOrgAction).mockResolvedValue([])
        vi.mocked(getOrgFromSlugAction).mockResolvedValue(mockOrg)

        const props = {
            params: Promise.resolve({ orgSlug: 'test-org' }),
        }

        renderWithProviders(await OrgDashboardPage(props))

        expect(screen.getByText(/Welcome to the/i)).toBeDefined()
    })

    it('heads the page with the route org above "Dashboard", once', async () => {
        vi.mocked(fetchStudiesForOrgAction).mockResolvedValue([])
        vi.mocked(getOrgFromSlugAction).mockResolvedValue(routeOrg)

        renderWithProviders(await OrgDashboardPage({ params: Promise.resolve({ orgSlug: routeOrg.slug }) }))

        const heading = screen.getByRole('heading', { level: 1, name: 'Dashboard' })

        expect(heading).toBeInTheDocument()
        // "Lab" is stripped by displayOrgName, so the eyebrow is the display form of the name.
        expect(pageHeaderEyebrow()).toBe('Mars University')
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    })
})
