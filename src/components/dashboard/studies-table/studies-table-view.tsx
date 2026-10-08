'use client'

import type { ReactNode } from 'react'
import type { Route } from 'next'
import { Divider, Group, Paper, Stack, Table, TableTbody, Text, Title } from '@mantine/core'
import { PlusIcon } from '@phosphor-icons/react/dist/ssr'
import { ButtonLink } from '@/components/links'
import { ErrorAlert } from '@/components/errors'
import { RefresherSlot } from '@/components/refresher'
import { semanticColor } from '@/theme/tokens'
import { TableHeader, tableMinWidth, type ColumnDef } from './columns'
import { EmptyState } from './empty-state'
import type { RowModel } from './row-model'
import type { ColumnId, SortState } from './sort'
import { StudyRowView } from './study-row-view'
import type { Audience } from './types'

// Presentational: the container builds the row models and owns the sort state.
export type StudiesTableViewProps = {
    rows: RowModel[]
    columns: ColumnDef[]
    sort: SortState
    onSort: (column: ColumnId) => void
    audience: Audience
    title?: string
    description?: string
    showDescription?: boolean
    newStudyHref?: Route
    refresher?: ReactNode
    isError?: boolean
    errorMessage?: string
    paperWrapper?: boolean
}

type StudiesTableBodyProps = Pick<
    StudiesTableViewProps,
    'rows' | 'columns' | 'sort' | 'onSort' | 'audience' | 'isError' | 'errorMessage'
>

function StudiesTableBody({ rows, columns, sort, onSort, audience, isError, errorMessage }: StudiesTableBodyProps) {
    if (isError) {
        return <ErrorAlert error={`Failed to load studies: ${errorMessage}`} />
    }

    // The header stays when there are no rows; the empty state sits under it (Figma 3531-6217).
    return (
        <>
            <Table
                layout="fixed"
                verticalSpacing="md"
                horizontalSpacing="md"
                highlightOnHover
                stickyHeader
                miw={tableMinWidth(columns)}
            >
                <TableHeader columns={columns} sort={sort} onSort={onSort} />
                <TableTbody>
                    {rows.map((row) => (
                        <StudyRowView key={row.id} row={row} columns={columns} />
                    ))}
                </TableTbody>
            </Table>
            <EmptyState audience={audience} isVisible={rows.length === 0} />
        </>
    )
}

export function StudiesTableView({
    title,
    description,
    showDescription = false,
    newStudyHref,
    refresher,
    isError = false,
    errorMessage = '',
    paperWrapper = false,
    ...table
}: StudiesTableViewProps) {
    const content = (
        <Stack>
            <Group justify="space-between" align="center">
                {title && <Title order={3}>{title}</Title>}
                {newStudyHref && (
                    <ButtonLink leftSection={<PlusIcon />} data-testid="new-study" href={newStudyHref}>
                        New study
                    </ButtonLink>
                )}
            </Group>
            <Divider c={semanticColor('border.default')} />
            {description && showDescription && <Text>{description}</Text>}
            <RefresherSlot>{refresher}</RefresherSlot>
            <StudiesTableBody {...table} isError={isError} errorMessage={errorMessage} />
        </Stack>
    )

    if (paperWrapper) {
        return (
            <Paper shadow="xs" p="xxl">
                {content}
            </Paper>
        )
    }

    return content
}
