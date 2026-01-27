import { Center, Loader, Stack } from '@mantine/core'

export function GlobalLoading() {
    return (
        <Center h="100vh">
            <Stack align="center" gap="md">
                <Loader size="xl" type="dots" />
            </Stack>
        </Center>
    )
}
