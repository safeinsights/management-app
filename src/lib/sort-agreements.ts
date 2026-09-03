import type { DataTableSortStatus } from 'mantine-datatable'

// Keyed by row field so a tie-break column that does not exist is a type error. Every accessor
// returns a string, dates included: ISO and YYYY-MM-DD both sort chronologically as text, which is
// what the rest of the app relies on for signed_at.
export type SortColumn<T> = Extract<keyof T, string>

export type SortValues<T> = Partial<Record<SortColumn<T>, (row: T) => string>>

type Options<T> = {
    sortValues: SortValues<T>
    tieBreakBy: SortColumn<T>
    // Rows this accessor reports empty sink to the bottom whichever way the column points, so an
    // unsigned agreement never leads the table.
    sinkEmpty?: (row: T) => string
}

export const sortAgreements = <T>(
    rows: T[],
    { columnAccessor, direction }: DataTableSortStatus<T>,
    { sortValues, tieBreakBy, sinkEmpty }: Options<T>,
) => {
    const flip = direction === 'asc' ? 1 : -1
    const valueOf = sortValues[columnAccessor as SortColumn<T>]
    const tieBreak = sortValues[tieBreakBy] ?? (() => '')

    return [...rows].sort((a, b) => {
        const byPresence = sinkEmpty ? Number(Boolean(sinkEmpty(b))) - Number(Boolean(sinkEmpty(a))) : 0
        if (byPresence !== 0) return byPresence

        const byColumn = valueOf ? valueOf(a).localeCompare(valueOf(b)) * flip : 0
        if (byColumn !== 0) return byColumn

        return tieBreak(a).localeCompare(tieBreak(b)) * flip
    })
}
