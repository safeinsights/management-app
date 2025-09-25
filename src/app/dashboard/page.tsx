import { Link } from '@/common'
import { Text } from '@mantine/core'

export default function Page() {
    return (
        <Text bg="white">
            {' '}
            dash Page <Link href="/dashboard/child">Child</Link>
        </Text>
    )
}
