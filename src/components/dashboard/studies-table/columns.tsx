import type { FC } from 'react'
import { Group, TableTh, TableThead, TableTr, Text, UnstyledButton } from '@mantine/core'
import { CaretDownIcon, CaretUpDownIcon, CaretUpIcon } from '@phosphor-icons/react/dist/ssr'
import { fontWeight } from '@/theme/tokens'
import classes from './columns.module.css'
import type { ColumnId, SortState } from './sort'
import type { Audience, Scope } from './types'

export type ColumnDef = { id: ColumnId; header: string; width?: number }

// The title column flexes; the table's minimum width keeps it from shrinking below this.
const TITLE_MIN_WIDTH = 224

const TITLE: ColumnDef = { id: 'title', header: 'Study title' }
const LAST_UPDATED: ColumnDef = { id: 'lastUpdated', header: 'Last updated', width: 128 }
const BELONGS_TO: ColumnDef = { id: 'belongsTo', header: 'Belongs to', width: 144 }
const SUBMITTED_TO: ColumnDef = { id: 'submittedTo', header: 'Submitted to', width: 144 }
const SUBMITTED_FROM: ColumnDef = { id: 'submittedFrom', header: 'Submitted from', width: 160 }
const SUBMITTED_BY: ColumnDef = { id: 'submittedBy', header: 'Submitted by', width: 144 }
const REVIEWED_BY: ColumnDef = { id: 'reviewedBy', header: 'Reviewed by', width: 144 }
const STATUS: ColumnDef = { id: 'status', header: 'Status', width: 224 }

export function getColumns(audience: Audience, scope: Scope, showBelongsTo: boolean): ColumnDef[] {
    const belongsTo = showBelongsTo ? [BELONGS_TO] : []
    if (audience === 'researcher') {
        return scope === 'org'
            ? [TITLE, LAST_UPDATED, SUBMITTED_TO, SUBMITTED_BY, STATUS]
            : [TITLE, LAST_UPDATED, ...belongsTo, SUBMITTED_TO, STATUS]
    }
    return scope === 'org'
        ? [TITLE, LAST_UPDATED, SUBMITTED_FROM, REVIEWED_BY, STATUS]
        : [TITLE, LAST_UPDATED, ...belongsTo, SUBMITTED_FROM, STATUS]
}

export const tableMinWidth = (columns: ColumnDef[]) =>
    columns.reduce((total, column) => total + (column.width ?? TITLE_MIN_WIDTH), 0)

const SortIcon: FC<{ id: ColumnId; sort: SortState }> = ({ id, sort }) => {
    if (sort.column !== id) return <CaretUpDownIcon size={12} aria-hidden />
    return sort.direction === 'asc' ? <CaretUpIcon size={12} aria-hidden /> : <CaretDownIcon size={12} aria-hidden />
}

const ariaSort = (id: ColumnId, sort: SortState) => {
    if (sort.column !== id) return undefined
    return sort.direction === 'asc' ? 'ascending' : 'descending'
}

type SortableHeaderProps = { column: ColumnDef; sort: SortState; onSort: (id: ColumnId) => void }

// A button inside the header cell, so Enter and Space sort and the cell can carry aria-sort.
const SortableHeader: FC<SortableHeaderProps> = ({ column, sort, onSort }) => {
    return (
        <TableTh w={column.width} aria-sort={ariaSort(column.id, sort)}>
            <UnstyledButton onClick={() => onSort(column.id)}>
                <Group gap="xxs" wrap="nowrap">
                    <Text fz="sm" fw={fontWeight.semibold} className={classes.label}>
                        {column.header}
                    </Text>
                    <SortIcon id={column.id} sort={sort} />
                </Group>
            </UnstyledButton>
        </TableTh>
    )
}

export function TableHeader({ columns, sort, onSort }: { columns: ColumnDef[] } & Omit<SortableHeaderProps, 'column'>) {
    return (
        <TableThead>
            <TableTr>
                {columns.map((column) => (
                    <SortableHeader key={column.id} column={column} sort={sort} onSort={onSort} />
                ))}
            </TableTr>
        </TableThead>
    )
}
