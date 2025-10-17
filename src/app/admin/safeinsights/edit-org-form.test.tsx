import { renderWithProviders, faker } from '@/tests/unit.helpers'
import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { EditOrgForm } from './edit-org-form'

const mockOrg = {
    id: '1',
    slug: 'test',
    email: faker.internet.email(),
    name: 'test',
    type: 'enclave' as const,
    settings: { publicKey: 'junk' },
    totalUsers: BigInt(0),
    totalStudies: BigInt(0),
}

describe('EditOrgForm', () => {
    it('renders form fields correctly', () => {
        renderWithProviders(<EditOrgForm org={mockOrg} />)
        const slugInput = screen.getByPlaceholderText('Enter slug')
        expect(slugInput).toBeDefined()
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
        const [, nameInput, emailInput] = inputs

        // Public key is a textarea now
        const publicKeyTextarea = screen.getByPlaceholderText('Enter your public key') as HTMLTextAreaElement

        // Type is a select that shows display text
        const typeSelect = screen.getByDisplayValue('Enclave (Data Organization)')

        expect(nameInput.value).toBe(mockOrg.name)
        expect(emailInput.value).toBe(mockOrg.email)
        expect(publicKeyTextarea.value).toBe((mockOrg.settings as { publicKey: string }).publicKey)
        expect(typeSelect).toBeDefined()
    })

    it('allows updating form fields', () => {
        renderWithProviders(<EditOrgForm org={mockOrg} />)

        const inputs = screen.getAllByRole('textbox') as HTMLInputElement[]
        const [slugInput, nameInput, emailInput] = inputs

        // Public key is a textarea now
        const publicKeyTextarea = screen.getByPlaceholderText('Enter your public key') as HTMLTextAreaElement

        fireEvent.change(slugInput, { target: { value: 'new-slug' } })
        fireEvent.change(nameInput, { target: { value: 'New Name' } })
        fireEvent.change(emailInput, { target: { value: 'new@example.com' } })
        fireEvent.change(publicKeyTextarea, { target: { value: 'new-key' } })

        expect(slugInput.value).toBe('new-slug')
        expect(nameInput.value).toBe('New Name')
        expect(emailInput.value).toBe('new@example.com')
        expect(publicKeyTextarea.value).toBe('new-key')
    })
})
