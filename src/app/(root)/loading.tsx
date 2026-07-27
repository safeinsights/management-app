import { Flex, Stack } from '@mantine/core'
import DashboardSkeleton from '@/components/layout/skeleton/dashboard'

export default function LoadingRoot() {
    return (
        <Flex direction="column" align="center" justify="center" mih="100svh" p="md" gap="xs">
            <Stack component="main" gap="xl" fw={700} fz={20}>
                <DashboardSkeleton />
            </Stack>
        </Flex>
    )
}
