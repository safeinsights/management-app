'use client'

import { TextInput, PasswordInput, Select, Button } from '@mantine/core'
import React from 'react'

export default function InviteForm() {
    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        // TODO: Implement invite user logic
    }

    return (
        <form onSubmit={handleSubmit}>
            <TextInput label="First Name" placeholder="Enter first name" required mb="sm" />
            <TextInput label="Last Name" placeholder="Enter last name" required mb="sm" />
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
            />
            <PasswordInput label="Password" placeholder="Enter password" required mb="sm" />
            <Button type="submit" mt="md" fullWidth>
                Invite
            </Button>
        </form>
    )
}
