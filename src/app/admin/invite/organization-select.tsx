import { Text, Select, type SelectProps } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { fetchMembersAction } from '@/server/actions/member-actions'
import { Member } from '@/schema/member'

export const OrganizationSelect: React.FC<SelectProps> = (props) => {
    const {
        data: members,
        isLoading,
        error,
    } = useQuery({
        queryKey: ['members'],
        initialData: [] as Member[],
        queryFn: () => fetchMembersAction(),
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
            data={members.map((m) => ({
                value: m.id, // use member id (uuid) for createUserAction
                label: m.name,
            }))}
            allowDeselect={false}
            searchable
            clearable={false}
            {...props}
        />
    )
}
