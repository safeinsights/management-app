import type { DataTableSortStatus } from 'mantine-datatable'

type SortKey = string | number

const compare = (a: SortKey, b: SortKey) =>
    typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))

// No nulls-last case: publish requires signed_at for these types and acked_at is NOT NULL.
export const sortAgreements = <T>(
    rows: T[],
    { columnAccessor, direction }: DataTableSortStatus<T>,
    sortValues: Record<string, (row: T) => SortKey>,
    tieBreak: (row: T) => string,
) => {
    const flip = direction === 'asc' ? 1 : -1
    const valueOf = sortValues[columnAccessor as string]

    return [...rows].sort((a, b) => {
        const byColumn = valueOf ? compare(valueOf(a), valueOf(b)) * flip : 0
        if (byColumn !== 0) return byColumn
        return tieBreak(a).localeCompare(tieBreak(b)) * flip
    })
}
