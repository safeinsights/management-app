'use client'

import React, { FC, useMemo } from 'react'
import { Group, LoadingOverlay, Stack, Text, useMantineTheme } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ErrorAlert } from '@/components/errors'
import { fetchApprovedJobFilesAction } from '@/server/actions/study-job.actions'
import { JobFile } from '@/lib/types'
import { DownloadResultsLink, ViewResultsLink } from './links'
import { LatestJobForStudy } from '@/server/db/queries'

export const JobResults: FC<{ job: LatestJobForStudy }> = ({ job }) => {
    const {
        data: approvedFiles,
        isLoading,
        isError,
        error,
    } = useQuery({
        queryKey: ['job-results', job.id],
        queryFn: async () => await fetchApprovedJobFilesAction(job.id),
    })

    const { resultsFiles, logFiles } = useMemo(() => {
        const res: JobFile[] = []
        const logs: JobFile[] = []

        approvedFiles?.forEach((f) => {
            if (f.fileType === 'APPROVED-RESULT') res.push(f)
            else if (f.fileType === 'APPROVED-LOG') logs.push(f)
        })

        res.sort((a, b) => a.path.localeCompare(b.path))
        logs.sort((a, b) => a.path.localeCompare(b.path))

        return { resultsFiles: res, logFiles: logs }
    }, [approvedFiles])

    if (isError) {
        return <ErrorAlert error={error} />
    }

    if (isLoading || !approvedFiles) {
        return <LoadingOverlay />
    }

    return (
        <Stack>
            {resultsFiles.map((approvedFile) => (
                <ViewFile file={approvedFile} key={approvedFile.path} />
            ))}
            {logFiles.map((approvedFile) => (
                <ViewFile file={approvedFile} key={approvedFile.path} />
            ))}
        </Stack>
    )
}

export const ViewFile: FC<{ file: JobFile }> = ({ file }) => {
    const theme = useMantineTheme()
    return (
        <Group gap="xs">
            <Text fz="sm" fw={600}>
                {file.fileType === 'APPROVED-RESULT' ? 'Results:' : 'Logs:'}
            </Text>
            <ViewResultsLink content={file.contents} />
            <span
                style={{
                    height: 16,
                    borderLeft: `1px solid ${theme.colors.charcoal[4]}`,
                }}
            ></span>
            <DownloadResultsLink target="_blank" filename={file.path} content={file.contents} />
        </Group>
    )
}
