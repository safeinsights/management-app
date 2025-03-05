'use client'

import { TextInput, PasswordInput, Select, Button } from '@mantine/core'
import React, { useState } from 'react'
import { OrganizationSelect } from '@/components/clerkcustom/organization-select'
import { createUserAction } from '@/server/actions/clerk-user-actions'

type InviteFormProps = {
    organizations: { id: string; name: string }[]
}

export default function InviteForm({ organizations }: InviteFormProps) {
    const [selectedOrg, setSelectedOrg] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        const firstName = formData.get('firstName')?.toString() ?? ''
        const lastName = formData.get('lastName')?.toString() ?? ''
        // Role is dismissed for now.
        const email = formData.get('email')?.toString() ?? ''
        const password = formData.get('password')?.toString() ?? ''

        // Use a default or empty string if no organization is selected
        const organizationId = selectedOrg || ''

        try {
            await createUserAction({
                firstName,
                lastName,
                email,
                password,
                organizationId,
            })
            // Reset form after successful submission
            e.currentTarget.reset()
            setSelectedOrg(null)
            // Optionally: provide success feedback
        } catch (error) {
            console.error('User creation failed:', error)
            // Optionally: display an error notification.
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            <OrganizationSelect
                organizations={organizations}
                onOrganizationSelect={setSelectedOrg}
            />
            <TextInput
                label="First Name"
                placeholder="Enter first name"
                required
                mb="sm"
                name="firstName"
            />
            <TextInput
                label="Last Name"
                placeholder="Enter last name"
                required
                mb="sm"
                name="lastName"
            />
            <Select
                label="Role"
                placeholder="Select role"
                data={[
                    { value: 'Reviewer', label: 'Reviewer' },
                    { value: 'Researcher', label: 'Researcher' },
                ]}
                required
                mb="sm"
            />
            <TextInput
                label="Email Address"
                placeholder="Enter email address"
                type="email"
                required
                mb="sm"
                name="email"
            />
            <PasswordInput
                label="Password"
                placeholder="Enter password"
                required
                mb="sm"
                name="password"
            />
            <Button type="submit" mt="md" fullWidth>
                Invite
            </Button>
        </form>
    )
}
