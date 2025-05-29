'use client'

import { FC } from 'react'

import { Alert, Divider, Flex, Group, LoadingOverlay, Stack, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import Papa from 'papaparse'
import { DataTable } from 'mantine-datatable'
import { ErrorAlert } from '@/components/errors'
import { Download, Notification } from '@phosphor-icons/react/dist/ssr'
import { resultsDownloadURL } from '@/lib/paths'
import { fetchJobResultsCsvAction } from '@/server/actions/study-job.actions'
import { ButtonLink } from '@/components/links'

type JobResultsProps = {
    job: { id: string; resultsPath?: string | null }
}

export const ViewJobResultsCSV: FC<JobResultsProps> = ({ job }) => {
    const {
        data: csv,
        isLoading,
        isError,
        error,
    } = useQuery({
        enabled: !!job.resultsPath,
        queryKey: ['job-results', job.id],
        queryFn: async () => {
            const csv = await fetchJobResultsCsvAction(job.id || '')
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

    if (!job.resultsPath) {
        return (
            <Flex justify={'center'} w="100%" mt="xl">
                <Alert variant="light" color="blue" title={'Results not available'} icon={<Notification />}>
                    <p>Results are not yet available for this study.</p>
                </Alert>
            </Flex>
        )
    }

    if (isError) {
        return <ErrorAlert error={error} />
    }

    if (isLoading || !csv) {
        return <LoadingOverlay />
    }

    return (
        <Stack mt="xl">
            <Group justify="space-between">
                <Title order={4} size="xl">
                    Study Results
                </Title>
                <Divider />
                <ButtonLink
                    target="_blank"
                    rightSection={<Download />}
                    href={resultsDownloadURL({ id: job.id, resultsPath: job.resultsPath })}
                >
                    Download Results
                </ButtonLink>
            </Group>

            <DataTable records={csv.data} columns={(csv?.meta?.fields || []).map((f) => ({ accessor: f }))} />
        </Stack>
    )
}
