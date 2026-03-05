import { parseCsv } from '@/lib/file-content-helpers'
import { DataTable } from 'mantine-datatable'
import type { ReactNode } from 'react'

export function csvViewer(path: string, text: string): ReactNode | null {
    if (!path.toLowerCase().endsWith('.csv')) return null

    const { headers, rows } = parseCsv(text)
    if (!(headers.length || rows.length)) return null

    const columns = headers.map((header) => ({ accessor: header, title: header }))
    const records = rows.map((row, i) =>
        Object.fromEntries([['_id', String(i)], ...headers.map((h, j) => [h, row[j] ?? ''])]),
    )

    return (
        <DataTable
            idAccessor="_id"
            height={500}
            withTableBorder
            withColumnBorders
            columns={columns}
            records={records}
        />
    )
}
