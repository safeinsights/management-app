'use client'

import { Select, Text } from '@mantine/core'
import { useEffect, useState } from 'react'

type Organization = {
    id: string
    name: string
}

export const OrganizationSelect = ({ 
    organizations,
    onOrganizationSelect
}: { 
    organizations: Organization[]
    onOrganizationSelect?: (orgId: string) => void 
}) => {
    const [selectedOrg, setSelectedOrg] = useState<string | null>(null)

    const handleChange = (value: string | null) => {
        setSelectedOrg(value)
        if (value && onOrganizationSelect) {
            onOrganizationSelect(value)
        }
    }

    if (!organizations.length) {
        return <Text>No organizations available</Text>
    }

    return (
        <Select
            label="Select Organization"
            placeholder="Choose an organization"
            data={organizations.map(org => ({
                value: org.id,
                label: org.name
            }))}
            value={selectedOrg}
            onChange={handleChange}
            allowDeselect={false}
        />
    )
}
