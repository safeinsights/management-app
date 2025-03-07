'use client'

import { TextInput, PasswordInput, Select, Button, Alert } from '@mantine/core'
import React, { useState } from 'react'
import { createUserAction } from '@/server/actions/clerk-user-actions'
import { IconAlertCircle } from '@tabler/icons-react'
import { OrganizationSelect } from '@/components/clerkcustom/organization-select'
import Link from 'next/link'

export default function InviteForm() {
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [formValues, setFormValues] = useState({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        role: ''
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
        // Role is dismissed for now.
        const email = formData.get('email')?.toString() ?? ''
        const password = formData.get('password')?.toString() ?? ''
        const organization = selectedOrganization || ''

        // Update form values state
        setFormValues({
            firstName,
            lastName,
            email,
            password,
            role: formData.get('role')?.toString() ?? ''
        })

        try {
            const result = await createUserAction({
                firstName,
                lastName,
                email,
                password,
            })
            
            if (result.success) {
                // Reset form state
                setFormValues({
                    firstName: '',
                    lastName: '',
                    email: '',
                    password: '',
                    role: ''
                });
                setSuccess(true);
            }
        } catch (error: any) {
            setError(error.message || 'User creation failed')
            console.error('User creation failed:', error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            {error && (
                <Alert icon={<IconAlertCircle size="1rem" />} color="red" mb="md">
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
              <Link href="/admin/members" style={{ textDecoration: 'none' }}>
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
            <Select
                label="Role"
                placeholder="Select role"
                data={[
                    { value: 'Reviewer', label: 'Reviewer' },
                    { value: 'Researcher', label: 'Researcher' },
                ]}
                required
                mb="sm"
                name="role"
                value={formValues.role}
                onChange={(value) => setFormValues({...formValues, role: value || ''})}
            />
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
