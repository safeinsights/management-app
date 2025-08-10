'use client'

import { Group, Skeleton, Stack } from '@mantine/core'

export default function NavbarSkeleton() {
    return (
        <Stack gap="sm" data-testid="navbar-skeleton">
            {/* OrgSwitcher skeleton */}
            <Stack gap={4} mx="sm">
                <Skeleton height={14} width="70%" color="gray.3" />
                <Skeleton height={36} radius="sm" color="gray.3" />
            </Stack>

            {/* Admin link skeleton */}
            <Group gap="sm" px="md" py="xs">
                <Skeleton height={20} width={20} color="gray.3" />
                <Skeleton height={16} width="40%" color="gray.3" />
            </Group>

            {/* Dashboard links skeleton */}
            <Group gap="sm" px="md" py="xs">
                <Skeleton height={20} width={20} color="gray.3" />
                <Skeleton height={16} width="60%" color="gray.3" />
            </Group>

            <Group gap="sm" px="md" py="xs">
                <Skeleton height={20} width={20} color="gray.3" />
                <Skeleton height={16} width="65%" color="gray.3" />
            </Group>
        </Stack>
    )
}
