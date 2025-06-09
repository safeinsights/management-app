import { renderWithProviders } from '@/tests/unit.helpers'
import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { Org } from '@/schema/org'
import { EditOrgForm } from './edit-org-form'

const mockOrg: Org = {
    id: '1',
    slug: 'test',
    name: 'test',
    email: 'junk@asdf.com',
    publicKey: 'junk',
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
}

describe('EditOrgForm', () => {
    it('renders form fields correctly', () => {
        renderWithProviders(<EditOrgForm org={mockOrg} />)

        const slugInput = screen.getByPlaceholderText('Enter slug')
        const inputs = screen.getAllByRole('textbox')

        expect(slugInput).toBeDefined()
        expect(inputs.length).toBe(4) // slug, name, email, public key
    })

    it('disables the slug field if org has an id', () => {
        renderWithProviders(<EditOrgForm org={{ ...mockOrg, id: '123' }} />)
        const slugInput = screen.getByPlaceholderText('Enter slug')
        expect(slugInput).toHaveProperty('disabled')
    })

    it('populates form fields with org data', () => {
        renderWithProviders(<EditOrgForm org={mockOrg} />)

        const slugInput = screen.getByPlaceholderText('Enter slug') as HTMLInputElement
        expect(slugInput.value).toBe(mockOrg.slug)

        const inputs = screen.getAllByRole('textbox') as HTMLInputElement[]
        const [, nameInput, emailInput, publicKeyInput] = inputs

        expect(nameInput.value).toBe(mockOrg.name)
        expect(emailInput.value).toBe(mockOrg.email)
        expect(publicKeyInput.value).toBe(mockOrg.publicKey)
    })

    it('allows updating form fields', () => {
        renderWithProviders(<EditOrgForm org={mockOrg} />)

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
