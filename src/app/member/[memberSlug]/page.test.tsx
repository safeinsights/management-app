import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/tests/unit.helpers'
import { getMemberFromSlugAction } from '@/server/actions/member.actions'
import { Member } from '@/schema/member'
import ManageMemberPage from './page'

// Mock the server action
vi.mock('@/server/actions/member.actions', () => ({
    getMemberFromSlugAction: vi.fn(),
}))

const mockMember: Member = {
    id: '1',
    slug: 'test-member',
    name: 'Test Member',
    email: 'test@example.com',
    publicKey: 'test-key',
    createdAt: new Date(),
    updatedAt: new Date(),
}

describe('ManageMemberPage', () => {
    it('renders member details when member is found', async () => {
        vi.mocked(getMemberFromSlugAction).mockResolvedValue(mockMember)

        const props = {
            params: Promise.resolve({ memberSlug: 'test-member' }),
        }

        const { container } = renderWithProviders(await ManageMemberPage(props))

        // Check title is rendered with member name
        const title = container.querySelector('h1')
        expect(title?.textContent).toBe(`Manage ${mockMember.name} details`)

        // Verify EditMemberForm is rendered
        expect(container.querySelector('form')).toBeDefined()
    })

    it('renders not found alert when member does not exist', async () => {
        vi.mocked(getMemberFromSlugAction).mockResolvedValue(undefined)

        const props = {
            params: Promise.resolve({ memberSlug: 'non-existent' }),
        }

        const { container } = renderWithProviders(await ManageMemberPage(props))

        // Check alert title and message
        const alertTitle = container.querySelector('[role="alert"]')
        expect(alertTitle?.textContent).toContain('Member was not found')
        expect(alertTitle?.textContent).toContain('no such member exists')

        // Verify EditMemberForm is not rendered
        expect(container.querySelector('form')).toBeNull()
    })

    it('passes correct member data to EditMemberForm', async () => {
        vi.mocked(getMemberFromSlugAction).mockResolvedValue(mockMember)

        const props = {
            params: Promise.resolve({ memberSlug: 'test-member' }),
        }

        const { container } = renderWithProviders(await ManageMemberPage(props))

        const slug = container.querySelector('input[name="slug"]') as HTMLInputElement
        const name = container.querySelector('input[name="name"]') as HTMLInputElement
        const email = container.querySelector('input[name="email"]') as HTMLInputElement
        const publicKey = container.querySelector('textarea[name="publicKey"]') as HTMLInputElement

        expect(slug.value).toBe(mockMember.slug)
        expect(name.value).toBe(mockMember.name)
        expect(email.value).toBe(mockMember.email)
        expect(publicKey.value).toBe(mockMember.publicKey)
    })

    it('calls getMemberFromSlug with correct slug', async () => {
        const memberSlug = 'test-member'
        vi.mocked(getMemberFromSlugAction).mockResolvedValue(mockMember)

        const props = {
            params: Promise.resolve({ memberSlug }),
        }

        await ManageMemberPage(props)

        expect(getMemberFromSlugAction).toHaveBeenCalledWith(memberSlug)
        expect(getMemberFromSlugAction).toHaveBeenCalledTimes(1)
    })
})
