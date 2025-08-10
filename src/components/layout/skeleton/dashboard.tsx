'use client'

import {
    Divider,
    Flex,
    Group,
    Paper,
    Skeleton,
    Stack,
    Table,
    TableTbody,
    TableTd,
    TableTh,
    TableThead,
    TableTr,
} from '@mantine/core'

export function DashboardHeaderSkeleton() {
    return (
        <Stack gap="sm" data-testid="dashboard-header-skeleton">
            {/* Page Title */}
            <Skeleton height={32} width="200px" />

            {/* Welcome text and description */}
            <Group gap="sm">
                <Skeleton height={20} width="250px" />
            </Group>
            <Skeleton height={16} width="80%" />
            <Skeleton height={16} width="60%" />
        </Stack>
    )
}

export const TableSkeleton = () => {
    const rows = 6
    const columns = 5

    return (
        <Paper shadow="xs" p="xl" data-testid="table-skeleton">
            <Stack gap="sm">
                {/* Table header with action button */}
                <Flex justify="space-between" align="center">
                    <Skeleton height={24} width="160px" />
                    <Skeleton height={36} width="160px" /> {/* Action button */}
                </Flex>

                <Divider />

                {/* Table */}
                <Table layout="fixed" verticalSpacing="md" striped="even">
                    <TableThead>
                        <TableTr>
                            {Array.from({ length: columns }).map((_, i) => (
                                <TableTh key={i}>
                                    <Skeleton height={14} width={i === 0 ? '80%' : '60%'} />
                                </TableTh>
                            ))}
                        </TableTr>
                    </TableThead>
                    <TableTbody>
                        {Array.from({ length: rows }).map((_, i) => (
                            <TableTr key={i}>
                                {Array.from({ length: columns }).map((_, j) => (
                                    <TableTd key={j}>
                                        <Skeleton height={16} width="70%" />
                                    </TableTd>
                                ))}
                            </TableTr>
                        ))}
                    </TableTbody>
                </Table>
            </Stack>
        </Paper>
    )
}

export default function DashboardSkeleton() {
    return (
        <Stack p="xl" gap="lg" data-testid="dashboard-skeleton">
            <DashboardHeaderSkeleton />
            <TableSkeleton />
        </Stack>
    )
}
