import { Text, Select, type SelectProps } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { fetchMembersForSelectAction } from '@/server/actions/member-actions'

export const OrganizationSelect: React.FC<SelectProps> = (props) => {
    const {
        data: members = [],
        isLoading,
        error,
    } = useQuery({
        queryKey: ['memberForSelect'],
        queryFn: fetchMembersForSelectAction,
    })

    if (isLoading) {
        return <div>Loading organisations...</div>
    }

    if (error) {
        return <div>Error loading organisations</div>
    }

    if (!members.length) {
        return <Text>No organisations available</Text>
    }

    return (
        <Select
            withAsterisk
            style={{ width: '100%' }}
            label="Select Organization"
            placeholder="Choose an organization"
            data={members}
            allowDeselect={false}
            searchable
            clearable={false}
            {...props}
        />
    )
}
