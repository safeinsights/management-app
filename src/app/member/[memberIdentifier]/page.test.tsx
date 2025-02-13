import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/tests/unit.helpers'
import { getMemberFromIdentifier } from '@/server/actions/member-actions'
import { Member } from '@/schema/member'
import ManageMemberPage from '@/app/member/[memberIdentifier]/page'
import { render } from '@testing-library/react'
import { TestingProvidersWrapper } from '@/tests/providers'

// Mock the server action
vi.mock('@/server/actions/member-actions', () => ({
    getMemberFromIdentifier: vi.fn(),
}))

const mockMember: Member = {
    id: '1',
    identifier: 'test-member',
    name: 'Test Member',
    email: 'test@example.com',
    publicKey: 'test-key',
    createdAt: new Date(),
    updatedAt: new Date(),
}

describe('ManageMemberPage', () => {
    it('renders member details when member is found', async () => {
        vi.mocked(getMemberFromIdentifier).mockResolvedValue(mockMember)

        const props = {
            params: Promise.resolve({ memberIdentifier: 'test-member' }),
        }

        const { container } = renderWithProviders(await ManageMemberPage(props))

        // Check title is rendered with member name
        const title = container.querySelector('h1')
        expect(title?.textContent).toBe(`Manage ${mockMember.name} details`)

        // Verify EditMemberForm is rendered
        expect(container.querySelector('form')).toBeDefined()
    })

    it('renders not found alert when member does not exist', async () => {
        vi.mocked(getMemberFromIdentifier).mockResolvedValue(undefined)

        const props = {
            params: Promise.resolve({ memberIdentifier: 'non-existent' }),
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
        vi.mocked(getMemberFromIdentifier).mockResolvedValue(mockMember)

        const props = {
            params: Promise.resolve({ memberIdentifier: 'test-member' }),
        }

        const { container } = renderWithProviders(await ManageMemberPage(props))

        const identifier = container.querySelector('input[name="identifier"]') as HTMLInputElement
        const name = container.querySelector('input[name="name"]') as HTMLInputElement
        const email = container.querySelector('input[name="email"]') as HTMLInputElement
        const publicKey = container.querySelector('textarea[name="publicKey"]') as HTMLInputElement

        expect(identifier.value).toBe(mockMember.identifier)
        expect(name.value).toBe(mockMember.name)
        expect(email.value).toBe(mockMember.email)
        expect(publicKey.value).toBe(mockMember.publicKey)
    })

    it('calls getMemberFromIdentifier with correct identifier', async () => {
        const memberIdentifier = 'test-member'
        vi.mocked(getMemberFromIdentifier).mockResolvedValue(mockMember)

        const props = {
            params: Promise.resolve({ memberIdentifier }),
        }

        await ManageMemberPage(props)

        expect(getMemberFromIdentifier).toHaveBeenCalledWith(memberIdentifier)
        expect(getMemberFromIdentifier).toHaveBeenCalledTimes(1)
    })
})
