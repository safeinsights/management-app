'use client'

import { TextInput, PasswordInput, Button, Alert, Checkbox, Group, Text } from '@mantine/core'
import React, { useState } from 'react'
import { createClerkUserAction } from '@/server/actions/clerk-user-actions'
import { Warning } from '@phosphor-icons/react'
import { OrganizationSelect } from '@/components/clerkcustom/organization-select'
import Link from 'next/link'
import { createUserAction } from '@/server/actions/user-actions'

export default function InviteForm() {
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [formValues, setFormValues] = useState({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        roles: {
            reviewer: false,
            researcher: false
        }
    })
    const [selectedOrganization, setSelectedOrganization] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setError(null)
        setSuccess(false)
        setLoading(true)

        const formData = new FormData(e.currentTarget)
        const firstName = formData.get('firstName')?.toString() ?? ''
        const lastName = formData.get('lastName')?.toString() ?? ''
        const email = formData.get('email')?.toString() ?? ''
        const password = formData.get('password')?.toString() ?? ''
        
        // Check if organization is selected
        if (!selectedOrganization) {
            setError('Please select an organization')
            setLoading(false)
            return
        }
        
        // Check if at least one role is selected
        if (!formValues.roles.reviewer && !formValues.roles.researcher) {
            setError('Please select at least one role (Reviewer or Researcher)')
            setLoading(false)
            return
        }

        // Update form values state
        setFormValues({
            firstName,
            lastName,
            email,
            password,
            roles: formValues.roles // Keep the existing roles structure
        })

        try {
            // save user in Clerk
            const result = await createClerkUserAction({
                firstName,
                lastName,
                email,
                password,
            })
            // save user in DB
            await createUserAction(
                result.clerkId,
                `${firstName} ${lastName}`,
                formValues.roles.researcher,
                selectedOrganization, // Use the selected organization ID directly
                formValues.roles.reviewer
            )
            
            if (result.success) {
                // Reset form state
                setFormValues({
                    firstName: '',
                    lastName: '',
                    email: '',
                    password: '',
                    roles: {
                        reviewer: false,
                        researcher: false
                    }
                })
                setSuccess(true)
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'User creation failed'
            setError(errorMessage)
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            {error && (
                <Alert icon={<Warning size={16} />} color="red" mb="md">
                    {error}
                </Alert>
            )}
            
            {success && (
                <Alert color="green" mb="md">
                    User created successfully!
                </Alert>
            )}
            <div
              style={{
                display: 'flex',
                width: '100%',
                gap: '1rem',
                alignItems: 'flex-end',
                marginBottom: '1rem'
              }}
            >
              <div style={{ flex: 1 }}>
                <OrganizationSelect onOrganizationSelect={(orgId) => setSelectedOrganization(orgId)} />
              </div>
              <Link href="/admin/organization" style={{ textDecoration: 'none' }}>
                <Button variant="outline">
                  New
                </Button>
              </Link>
            </div>
            <TextInput
                label="First Name"
                placeholder="Enter first name"
                required
                mb="sm"
                name="firstName"
                value={formValues.firstName}
                onChange={(e) => setFormValues({...formValues, firstName: e.target.value})}
            />
            <TextInput
                label="Last Name"
                placeholder="Enter last name"
                required
                mb="sm"
                name="lastName"
                value={formValues.lastName}
                onChange={(e) => setFormValues({...formValues, lastName: e.target.value})}
            />
            <div style={{ marginBottom: '1rem' }}>
                <Text fw={500} size="sm" mb={5}>Roles (select at least one)</Text>
                <Group>
                    <Checkbox
                        label="Reviewer"
                        name="role-reviewer"
                        checked={formValues.roles.reviewer}
                        onChange={(e) => setFormValues({
                            ...formValues, 
                            roles: {
                                ...formValues.roles,
                                reviewer: e.currentTarget.checked
                            }
                        })}
                    />
                    <Checkbox
                        label="Researcher"
                        name="role-researcher"
                        checked={formValues.roles.researcher}
                        onChange={(e) => setFormValues({
                            ...formValues, 
                            roles: {
                                ...formValues.roles,
                                researcher: e.currentTarget.checked
                            }
                        })}
                    />
                </Group>
            </div>
            <TextInput
                label="Email Address"
                placeholder="Enter email address"
                type="email"
                required
                mb="sm"
                name="email"
                value={formValues.email}
                onChange={(e) => setFormValues({...formValues, email: e.target.value})}
            />
            <PasswordInput
                label="Password"
                placeholder="Enter password"
                required
                mb="sm"
                name="password"
                value={formValues.password}
                onChange={(e) => setFormValues({...formValues, password: e.target.value})}
            />
            <Button type="submit" mt="md" fullWidth loading={loading}>
                Invite
            </Button>
        </form>
    )
}
