import type { DataTableSortStatus } from 'mantine-datatable'

// Every accessor returns a string, dates included: ISO and YYYY-MM-DD both sort chronologically as
// text, which is what the rest of the app relies on for signed_at.
export type SortValues<T> = Record<string, (row: T) => string>

// No nulls-last case, unlike the org page: publish requires signed_at for these types and acked_at
// is NOT NULL.
export const sortAgreements = <T>(
    rows: T[],
    { columnAccessor, direction }: DataTableSortStatus<T>,
    sortValues: SortValues<T>,
    tieBreakBy: string,
) => {
    const flip = direction === 'asc' ? 1 : -1
    const valueOf = sortValues[columnAccessor as string]
    const tieBreak = sortValues[tieBreakBy]

    return [...rows].sort((a, b) => {
        const byColumn = valueOf ? valueOf(a).localeCompare(valueOf(b)) * flip : 0
        if (byColumn !== 0) return byColumn
        return tieBreak(a).localeCompare(tieBreak(b)) * flip
    })
}
