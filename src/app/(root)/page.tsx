import { Flex, Stack } from '@mantine/core'
import { UserNav } from './user-nav'

// TODO Remove this root page?,
//  or route users based on their roles to correct pages?
export default function Home() {
    return (
        <Flex direction="column" align="center" justify="center" mih="100svh" p="md" gap="xs">
            <Stack component="main" gap="xl" fw={700} fz={20}>
                <UserNav />
            </Stack>
        </Flex>
    )
}
