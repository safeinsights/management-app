'use client'

import { FC } from 'react'

import { Flex, LoadingOverlay, Stack } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ErrorAlert } from '@/components/errors'
import { Download } from '@phosphor-icons/react/dist/ssr'
import { resultsDownloadURL } from '@/lib/paths'
import { fetchJobResultsCsvAction } from '@/server/actions/study-job.actions'
import { ButtonLink } from '@/components/links'
import { StudyJobStatus, type StudyStatus } from '@/database/types'
import { RenderCSV } from './render-csv'

type JobResultsProps = {
    job: { id: string; resultsPath?: string | null; latestStatus: StudyStatus | StudyJobStatus }
}

export const ViewJobResultsCSV: FC<JobResultsProps> = ({ job }) => {
    const {
        data: results,
        isLoading,
        isError,
        error,
    } = useQuery({
        enabled: !!job.resultsPath,
        queryKey: ['job-results', job.id],
        queryFn: async () => await fetchJobResultsCsvAction(job.id || ''),
    })

    if (job.latestStatus !== 'RESULTS-APPROVED' || !job.resultsPath) {
        return null
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
                    href={resultsDownloadURL({ id: job.id, resultsPath: job.resultsPath })}
                >
                    Download Results
                </ButtonLink>
            </Flex>
            <RenderCSV csv={results} />
        </Stack>
    )
}
