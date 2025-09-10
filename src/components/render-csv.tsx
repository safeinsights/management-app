'use client'

import { type FC } from 'react'
import Papa from 'papaparse'
import { DataTable } from 'mantine-datatable'
import { LoadingOverlay, Flex } from '@mantine/core'
import { ErrorAlert } from '@/components/errors'

// eslint-disable-next-line no-restricted-imports
import { useQuery, skipToken } from '@tanstack/react-query'

type CSV = Record<string, string | number>

export const RenderCSV: FC<{ csv: string }> = ({ csv: txt }) => {
    const {
        data: csv,
        isLoading,
        isError,
        error,
    } = useQuery({
        queryKey: ['csv', txt],
        queryFn: txt
            ? () =>
                  Papa.parse<CSV>(txt, {
                      header: true,
                      complete: (results) => {
                          results.data.forEach((row, i) => {
                              row['INDEX_KEY_FOR_RENDERING'] = i
                          })
                      },
                  })
            : skipToken,
    })

    if (isError) {
        return (
            <Flex direction={'column'}>
                <ErrorAlert error={error} />
                <div>{txt}</div>
            </Flex>
        )
    }

    if (isLoading || !csv) {
        return <LoadingOverlay />
    }

    return (
        <DataTable
            records={csv.data}
            columns={(csv?.meta?.fields || []).map((f) => ({ accessor: f }))}
            idAccessor="INDEX_KEY_FOR_RENDERING"
        />
    )
}
