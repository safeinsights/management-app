'use client'

import { FC } from 'react'
import { Flex, LoadingOverlay, Text, Stack } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ErrorAlert } from '@/components/errors'
import { Download } from '@phosphor-icons/react/dist/ssr'
import { resultsDownloadURL } from '@/lib/paths'
import { fetchJobResultsCsvAction } from '@/server/actions/study-job.actions'
import { ButtonLink } from '@/components/links'
import { RenderCSV } from './render-csv'
import { AllStatus } from '@/lib/types'

type JobResultsProps = {
    job: {
        id: string
        statusChanges: Array<{ status: AllStatus; createdAt: Date | string }>
    }
}

export const ViewJobResultsCSV: FC<JobResultsProps> = ({ job }) => {
    const isApproved = !!job.statusChanges.find((sc) => sc.status == 'RESULTS-APPROVED')

    const {
        data: results,
        isLoading,
        isError,
        error,
    } = useQuery({
        enabled: isApproved,
        queryKey: ['job-results', job.id],
        queryFn: async () => await fetchJobResultsCsvAction(job.id || ''),
    })

    if (!isApproved) {
        return <Text size="md">Study results will be displayed after the data organization reviews them.</Text>
    }

    if (isError) {
        return <ErrorAlert error={error} />
    }

    if (isLoading || !results) {
        return <LoadingOverlay />
    }

    return (
        <Stack>
            <Flex justify={'end'}>
                <ButtonLink
                    target="_blank"
                    rightSection={<Download />}
                    href={resultsDownloadURL({ id: job.id, resultsPath: results.path })}
                >
                    Download Results
                </ButtonLink>
            </Flex>
            <RenderCSV csv={results.contents} />
        </Stack>
    )
}
