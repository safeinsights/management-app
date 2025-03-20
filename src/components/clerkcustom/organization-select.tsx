'use client'

import { Select, Text } from '@mantine/core'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMembersAction } from '@/server/actions/member-actions'
import { Member } from '@/schema/member'

export const OrganizationSelect = ({
  onOrganizationSelect,
}: {
  onOrganizationSelect?: (orgId: string) => void
}) => {
  const { data: members, isLoading, error } = useQuery({
    queryKey: ['members'],
    initialData: [] as Member[],
    queryFn: () => fetchMembersAction(),
  })

  const [selected, setSelected] = useState<string | null>(null)

  if (isLoading) {
    return <div>Loading organisations...</div>
  }

  if (error) {
    return <div>Error loading organisations</div>
  }

  if (!members.length) {
    return <Text>No organisations available</Text>
  }

  const handleChange = (value: string | null) => {
    setSelected(value)
    if (value && onOrganizationSelect) {
      onOrganizationSelect(value)
    }
  }

  return (
    <Select
      required
      style={{ width: '100%' }}
      label="Select Organization"
      placeholder="Choose an organization"
      data={members.map((m) => ({
        value: m.id, // use member id (uuid) for createUserAction
        label: m.name,
      }))}
      value={selected ?? undefined}
      onChange={handleChange}
      allowDeselect={false}
      searchable
      clearable={false}
    />
  )
}
