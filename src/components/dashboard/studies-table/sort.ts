import { useMemo, useState } from 'react'
import type { PillId } from '@/lib/status-labels'
import type { RowModel } from './row-model'

export type ColumnId =
    | 'title'
    | 'lastUpdated'
    | 'belongsTo'
    | 'submittedTo'
    | 'submittedFrom'
    | 'submittedBy'
    | 'reviewedBy'
    | 'status'

export type SortDirection = 'asc' | 'desc'
export type SortState = { column: ColumnId; direction: SortDirection }

export const DEFAULT_SORT: SortState = { column: 'lastUpdated', direction: 'desc' }

// Lifecycle order for the Status column (pipeline position, earliest first). Kept explicit rather
// than read off PILL_PRESENTATION's key order; a test pins it to cover every pill.
export const STATUS_LIFECYCLE: PillId[] = [
    'proposal-draft',
    'proposal-submitted',
    'proposal-needs-review',
    'proposal-needs-revision',
    'proposal-revision-requested',
    'proposal-approved',
    'proposal-declined',
    'code-draft',
    'code-awaiting',
    'code-submitted',
    'code-needs-review',
    'code-needs-revision',
    'code-revision-requested',
    'code-approved',
    'code-declined',
    'code-processing',
    'code-preparing',
    'code-queued',
    'code-running',
    'code-errored',
    'outputs-awaiting',
    'outputs-need-review',
    'outputs-reviewed',
]

// Last updated sorts newest first only; any click on it returns to the default.
export function nextSort(current: SortState, clicked: ColumnId): SortState {
    if (clicked === 'lastUpdated') return DEFAULT_SORT
    if (current.column !== clicked) return { column: clicked, direction: 'asc' }
    return { column: clicked, direction: current.direction === 'asc' ? 'desc' : 'asc' }
}

type SortValue = string | number | null

// null is a placeholder (`Not submitted`, `Not reviewed`) and sorts after real values either way.
const SORT_VALUE: Record<ColumnId, (row: RowModel) => SortValue> = {
    title: (row) => row.title,
    lastUpdated: (row) => row.lastActivityAt.getTime(),
    belongsTo: (row) => row.belongsTo,
    submittedTo: (row) => row.submittedTo,
    submittedFrom: (row) => row.submittedFrom,
    submittedBy: (row) => row.submittedBy.name,
    reviewedBy: (row) => row.reviewedBy.name,
    status: (row) => STATUS_LIFECYCLE.indexOf(row.status.id),
}

const compareValues = (a: SortValue, b: SortValue): number => {
    if (typeof a === 'number' && typeof b === 'number') return a - b
    return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' })
}

const newestFirst = (a: RowModel, b: RowModel) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime()

export function sortRows(rows: RowModel[], sort: SortState): RowModel[] {
    const valueOf = SORT_VALUE[sort.column]
    const sign = sort.direction === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
        const left = valueOf(a)
        const right = valueOf(b)
        if (left === null || right === null) {
            if (left !== right) return left === null ? 1 : -1
            return newestFirst(a, b)
        }
        return sign * compareValues(left, right) || newestFirst(a, b)
    })
}

// Plain component state, so the sort never outlives the page (the card's "must not persist").
export function useStudiesTableSort(rows: RowModel[]) {
    const [sort, setSort] = useState<SortState>(DEFAULT_SORT)
    const sortedRows = useMemo(() => sortRows(rows, sort), [rows, sort])
    const onSort = (column: ColumnId) => setSort((current) => nextSort(current, column))
    return { rows: sortedRows, sort, onSort }
}
