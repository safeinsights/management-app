import { parseCsv } from '@/lib/file-content-helpers'
import { Text } from '@mantine/core'
import { DataTable } from 'mantine-datatable'
import { type FC, useMemo } from 'react'

export const CsvViewer: FC<{ text: string }> = ({ text }) => {
    const { columns, records } = useMemo(() => {
        const { headers, rows } = parseCsv(text)
        return {
            columns: headers.map((header) => ({ accessor: header, title: header })),
            records: rows.map((row, i) =>
                Object.fromEntries([['_id', String(i)], ...headers.map((h, j) => [h, row[j] ?? ''])]),
            ),
        }
    }, [text])

    if (columns.length === 0) {
        return <Text>Empty file</Text>
    }

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
