import { renderWithProviders } from '@/tests/unit.helpers'
import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { Member } from '@/schema/member'
import { EditMemberForm } from '@/components/member/edit-member-form'

const mockMember: Member = {
    id: '1',
    slug: 'test',
    name: 'test',
    email: 'junk@asdf.com',
    publicKey: 'junk',
    createdAt: new Date(),
    updatedAt: new Date(),
}

describe('EditMemberForm', () => {
    it('renders form fields correctly', () => {
        renderWithProviders(<EditMemberForm member={mockMember} />)

        const slugInput = screen.getByPlaceholderText('Enter slug')
        const inputs = screen.getAllByRole('textbox')

        expect(slugInput).toBeDefined()
        expect(inputs.length).toBe(4) // slug, name, email, public key
    })

    it('disables the slug field if member has an id', () => {
        renderWithProviders(<EditMemberForm member={{ ...mockMember, id: '123' }} />)
        const slugInput = screen.getByPlaceholderText('Enter slug')
        expect(slugInput).toHaveProperty('disabled')
    })

    it('populates form fields with member data', () => {
        renderWithProviders(<EditMemberForm member={mockMember} />)

        const slugInput = screen.getByPlaceholderText('Enter slug') as HTMLInputElement
        expect(slugInput.value).toBe(mockMember.slug)

        const inputs = screen.getAllByRole('textbox') as HTMLInputElement[]
        const [, nameInput, emailInput, publicKeyInput] = inputs

        expect(nameInput.value).toBe(mockMember.name)
        expect(emailInput.value).toBe(mockMember.email)
        expect(publicKeyInput.value).toBe(mockMember.publicKey)
    })

    it('allows updating form fields', () => {
        renderWithProviders(<EditMemberForm member={mockMember} />)

        const inputs = screen.getAllByRole('textbox') as HTMLInputElement[]
        const [slugInput, nameInput, emailInput, publicKeyInput] = inputs

        fireEvent.change(slugInput, { target: { value: 'new-slug' } })
        fireEvent.change(nameInput, { target: { value: 'New Name' } })
        fireEvent.change(emailInput, { target: { value: 'new@example.com' } })
        fireEvent.change(publicKeyInput, { target: { value: 'new-key' } })

        expect(slugInput.value).toBe('new-slug')
        expect(nameInput.value).toBe('New Name')
        expect(emailInput.value).toBe('new@example.com')
        expect(publicKeyInput.value).toBe('new-key')
    })
})
