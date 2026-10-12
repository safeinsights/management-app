'use client'

import { Group, Skeleton, Stack } from '@mantine/core'

export default function NavbarSkeleton() {
    return (
        <Stack gap="sm" data-testid="navbar-skeleton">
            <Stack gap="xxs" mx="sm">
                <Skeleton height={14} width="70%" />
                <Skeleton height={36} radius="sm" />
            </Stack>

            <Group gap="sm" px="md" py="xs">
                <Skeleton height={20} width={20} />
                <Skeleton height={16} width="40%" />
            </Group>

            <Group gap="sm" px="md" py="xs">
                <Skeleton height={20} width={20} />
                <Skeleton height={16} width="60%" />
            </Group>

            <Group gap="sm" px="md" py="xs">
                <Skeleton height={20} width={20} />
                <Skeleton height={16} width="65%" />
            </Group>
        </Stack>
    )
}
