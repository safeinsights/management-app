import { Text, Select, type SelectProps } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { fetchOrgsForSelectAction } from '@/server/actions/org.actions'

export const OrganizationSelect: React.FC<SelectProps> = (props) => {
    const {
        data: orgs = [],
        isLoading,
        error,
    } = useQuery({
        queryKey: ['orgForSelect'],
        queryFn: fetchOrgsForSelectAction,
    })

    if (isLoading) {
        return <div>Loading organisations...</div>
    }

    if (error) {
        return <div>Error loading organisations</div>
    }

    if (!orgs.length) {
        return <Text>No organisations available</Text>
    }

    return (
        <Select
            withAsterisk
            style={{ width: '100%' }}
            label="Select Organization"
            placeholder="Choose an organization"
            data={orgs}
            allowDeselect={false}
            searchable
            clearable={false}
            {...props}
        />
    )
}
