'use client'

import { FC } from 'react'
import Papa from 'papaparse'
import { DataTable } from 'mantine-datatable'
import { LoadingOverlay } from '@mantine/core'
import { ErrorAlert } from '@/components/errors'
import { useQuery, skipToken } from '@tanstack/react-query'
import { Flex } from '@mantine/core'

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
