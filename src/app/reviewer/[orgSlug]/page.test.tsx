import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/tests/unit.helpers'
import { getOrgFromSlugAction } from '@/server/actions/org.actions'
import { Org } from '@/schema/org'
import ManageOrgPage from './page'

// Mock the server action
vi.mock('@/server/actions/org.actions', () => ({
    getOrgFromSlugAction: vi.fn(),
}))

const mockOrg: Org = {
    id: '1',
    slug: 'test-org',
    name: 'Test Org',
    email: 'test@example.com',
    publicKey: 'test-key',
    createdAt: new Date(),
    updatedAt: new Date(),
}

describe('ManageOrgPage', () => {
    it('renders org details when org is found', async () => {
        vi.mocked(getOrgFromSlugAction).mockResolvedValue(mockOrg)

        const props = {
            params: Promise.resolve({ orgSlug: 'test-org' }),
        }

        const { container } = renderWithProviders(await ManageOrgPage(props))

        // Check title is rendered with org name
        const title = container.querySelector('h1')
        expect(title?.textContent).toBe(`Manage ${mockOrg.name} details`)

        // Verify EditOrgForm is rendered
        expect(container.querySelector('form')).toBeDefined()
    })

    it('renders not found alert when org does not exist', async () => {
        const props = {
            params: Promise.resolve({ orgSlug: 'non-existent' }),
        }

        const { container } = renderWithProviders(await ManageOrgPage(props))

        // Check alert title and message
        const alertTitle = container.querySelector('[role="alert"]')
        expect(alertTitle?.textContent).toContain('Organization was not found')
        expect(alertTitle?.textContent).toContain('no such organization exists')

        // Verify EditOrgForm is not rendered
        expect(container.querySelector('form')).toBeNull()
    })

    it('passes correct org data to EditOrgForm', async () => {
        vi.mocked(getOrgFromSlugAction).mockResolvedValue(mockOrg)

        const props = {
            params: Promise.resolve({ orgSlug: 'test-org' }),
        }

        const { container } = renderWithProviders(await ManageOrgPage(props))

        const slug = container.querySelector('input[name="slug"]') as HTMLInputElement
        const name = container.querySelector('input[name="name"]') as HTMLInputElement
        const email = container.querySelector('input[name="email"]') as HTMLInputElement
        const publicKey = container.querySelector('textarea[name="publicKey"]') as HTMLInputElement

        expect(slug.value).toBe(mockOrg.slug)
        expect(name.value).toBe(mockOrg.name)
        expect(email.value).toBe(mockOrg.email)
        expect(publicKey.value).toBe(mockOrg.publicKey)
    })

    it('calls getOrgFromSlug with correct slug', async () => {
        const orgSlug = 'test-org'
        vi.mocked(getOrgFromSlugAction).mockResolvedValue(mockOrg)

        const props = {
            params: Promise.resolve({ orgSlug }),
        }

        await ManageOrgPage(props)

        expect(getOrgFromSlugAction).toHaveBeenCalledWith(orgSlug)
        expect(getOrgFromSlugAction).toHaveBeenCalledTimes(1)
    })
})
