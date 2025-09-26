import { Link } from '@/common'
import { Text } from '@mantine/core'

export default async function Page(props: { params: Promise<{ orgSlug: string }> }) {
    const { orgSlug } = await props.params

    return (
        <Text bg="white">
            {orgSlug} org dashbaord page <Link href="/dashboard/">Main Dashboard</Link>
        </Text>
    )
}
