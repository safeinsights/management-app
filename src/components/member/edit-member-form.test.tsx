import { renderWithProviders } from '@/tests/unit.helpers'
import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { Member } from '@/schema/member'
import { EditMemberForm } from '@/components/member/edit-member-form'

const mockMember: Member = {
    id: '1',
    identifier: 'test',
    name: 'test',
    email: 'junk@asdf.com',
    publicKey: 'junk',
    createdAt: new Date(),
    updatedAt: new Date(),
}

describe('EditMemberForm', () => {
    it('renders form fields correctly', () => {
        renderWithProviders(<EditMemberForm member={mockMember} />)

        const identifierInput = screen.getByPlaceholderText('Enter identifier')
        const inputs = screen.getAllByRole('textbox')

        expect(identifierInput).toBeDefined()
        expect(inputs.length).toBe(4) // identifier, name, email, public key
    })

    it('disables the identifier field if member has an id', () => {
        renderWithProviders(<EditMemberForm member={{ ...mockMember, id: '123' }} />)
        const identifierInput = screen.getByPlaceholderText('Enter identifier')
        expect(identifierInput).toHaveProperty('disabled')
    })

    it('populates form fields with member data', () => {
        renderWithProviders(<EditMemberForm member={mockMember} />)

        const identifierInput = screen.getByPlaceholderText('Enter identifier') as HTMLInputElement
        expect(identifierInput.value).toBe(mockMember.identifier)

        const inputs = screen.getAllByRole('textbox') as HTMLInputElement[]
        const [, nameInput, emailInput, publicKeyInput] = inputs

        expect(nameInput.value).toBe(mockMember.name)
        expect(emailInput.value).toBe(mockMember.email)
        expect(publicKeyInput.value).toBe(mockMember.publicKey)
    })

    it('allows updating form fields', () => {
        renderWithProviders(<EditMemberForm member={mockMember} />)

        const inputs = screen.getAllByRole('textbox') as HTMLInputElement[]
        const [identifierInput, nameInput, emailInput, publicKeyInput] = inputs

        fireEvent.change(identifierInput, { target: { value: 'new-identifier' } })
        fireEvent.change(nameInput, { target: { value: 'New Name' } })
        fireEvent.change(emailInput, { target: { value: 'new@example.com' } })
        fireEvent.change(publicKeyInput, { target: { value: 'new-key' } })

        expect(identifierInput.value).toBe('new-identifier')
        expect(nameInput.value).toBe('New Name')
        expect(emailInput.value).toBe('new@example.com')
        expect(publicKeyInput.value).toBe('new-key')
    })
})
