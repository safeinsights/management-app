import { parseCsv } from '@/lib/file-content-helpers'
import { DataTable } from 'mantine-datatable'
import type { ReactNode } from 'react'

// height would stretch a short file's rows to fill the viewer; maxHeight lets the table
// keep its natural height and only scroll once it outgrows the modal.
const MAX_HEIGHT = 500

const NOWRAP = { whiteSpace: 'nowrap' } as const

export function csvViewer(path: string, text: string): ReactNode | null {
    if (!path.toLowerCase().endsWith('.csv')) return null

    const { headers, rows } = parseCsv(text)
    if (!(headers.length || rows.length)) return null

    const columns = headers.map((header) => ({
        accessor: header,
        title: header,
        noWrap: true,
        cellsStyle: () => NOWRAP,
        titleStyle: () => NOWRAP,
    }))
    const records = rows.map((row, i) =>
        Object.fromEntries([['_id', String(i)], ...headers.map((h, j) => [h, row[j] ?? ''])]),
    )

    return (
        <DataTable
            idAccessor="_id"
            maxHeight={MAX_HEIGHT}
            pinFirstColumn
            withColumnBorders
            striped
            highlightOnHover
            verticalSpacing="xs"
            horizontalSpacing="md"
            fz="sm"
            columns={columns}
            records={records}
            noRecordsText="This file has no rows"
        />
    )
}
