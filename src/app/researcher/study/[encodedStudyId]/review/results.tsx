'use client'

import { FC } from 'react'
import Link from 'next/link'
import { Button, LoadingOverlay, Modal, ScrollArea } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { uuidToB64 } from '@/lib/uuid'
import Papa from 'papaparse'
import { DataTable } from 'mantine-datatable'
import { fetchRunResultsAction } from './actions'
import { ErrorAlert } from '@/components/errors'
import { IconDownload } from '@tabler/icons-react'

type RunResultsProps = {
    run: { id: string }
}

const ViewCSV: FC<RunResultsProps> = ({ run }) => {
    const {
        data: csv,
        isLoading,
        isError,
        error,
    } = useQuery({
        queryKey: ['run-results', run.id],
        queryFn: async () => {
            const csv = await fetchRunResultsAction(run.id)
            return Papa.parse<Record<string, string | number>>(csv, {
                header: true,
                complete: (results) => {
                    results.data.forEach((row, i) => {
                        row['INDEX_KEY_FOR_RENDERING'] = i
                    })
                    return results
                },
            })
        },
    })

    if (isError) {
        return <ErrorAlert error={error} />
    }

    if (isLoading || !csv) {
        return <LoadingOverlay />
    }

    return (
        <DataTable
            height={'calc(100vh - 200px)'}
            idAccessor={'INDEX_KEY_FOR_RENDERING'}
            withTableBorder={false}
            withColumnBorders={false}
            records={csv.data}
            columns={(csv?.meta?.fields || []).map((f) => ({ accessor: f }))}
        />
    )
}

export const PreviewCSVResultsBtn: FC<RunResultsProps> = ({ run }) => {
    const [opened, { open, close }] = useDisclosure(false)

    return (
        <>
            <Modal
                opened={opened}
                onClose={close}
                size="100%"
                title={
                    <Link href={`/dl/results/${uuidToB64(run.id)}`}>
                        <Button rightSection={<IconDownload size={14} />}>Download Results</Button>
                    </Link>
                }
                scrollAreaComponent={ScrollArea.Autosize}
                overlayProps={{
                    backgroundOpacity: 0.55,
                    blur: 3,
                }}
                centered
            >
                <ViewCSV run={run} />
            </Modal>

            <Button variant="outline" onClick={open}>
                View Results
            </Button>
        </>
    )
}
