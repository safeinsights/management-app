import type { Metadata } from 'next'
import { Flex, Stack } from '@mantine/core'
import { UserNav } from './user-nav'
import { fontWeight } from '@/theme/tokens'

export const metadata: Metadata = { title: 'Home' }

export default function Home() {
    return (
        <Flex direction="column" align="center" justify="center" mih="100svh" p="md" gap="xs">
            <Stack component="main" gap="xl" fw={fontWeight.bold} fz={20}>
                <UserNav />
            </Stack>
        </Flex>
    )
}
