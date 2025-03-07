'use client'

import { Select, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAllOrganizations } from '@/server/actions/organization-actions'

type Organization = {
    identifier: string
    name: string
}

export const OrganizationSelect = ({
    onOrganizationSelect
}: {
    onOrganizationSelect?: (orgId: string) => void
}) => {
    const {
         organizations = [] as Organization[],
        isLoading,
        error,
    } = useQuery({
        queryKey: ['organizations'],
        queryFn: getAllOrganizations,
    })

    const [selectedOrg, setSelectedOrg] = useState<string | null>(null)
    
    if (isLoading) return <div>Loading organizations...</div>
    if (error) return <div>Error loading organizations</div>

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
                value: org.identifier,
                label: org.name
            }))}
            value={selectedOrg}
            onChange={handleChange}
            allowDeselect={false}
        />
    )
}
