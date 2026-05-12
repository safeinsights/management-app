'use client'

import React, { FC, useMemo } from 'react'
import { Anchor, Group, LoadingOverlay, Stack, Text, useMantineTheme } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import { useQuery } from '@/common'
import { ErrorAlert } from '@/components/errors'
import { DownloadBlobLink } from '@/components/download-blob-link'
import { isApprovedLogType, logLabel } from '@/lib/file-type-helpers'
import { fetchApprovedJobFilesAction } from '@/server/actions/study-job.actions'
import { JobFile } from '@/lib/types'
import { LatestJobForStudy } from '@/server/db/queries'

const ViewResultsLink: FC<{ content: ArrayBuffer }> = ({ content }) => {
    const handleClick = () => {
        const decoder = new TextDecoder('utf-8')
        const decodedString = decoder.decode(content)
        const tab = window.open('about:blank', '_blank')
        if (!tab) {
            reportError('failed to open results window')
        }
        tab?.document.write(decodedString)
        tab?.document.close()
    }

    return (
        <Anchor role="button" onClick={handleClick} style={{ display: 'flex', alignItems: 'center' }}>
            View <ArrowSquareOutIcon size={16} style={{ marginLeft: 4 }} />
        </Anchor>
    )
}

export const JobResults: FC<{ job: LatestJobForStudy }> = ({ job }) => {
    const {
        data: approvedFiles,
        isLoading,
        isError,
        error,
    } = useQuery({
        queryKey: ['job-results', job.id],
        queryFn: async () => await fetchApprovedJobFilesAction({ studyJobId: job.id }),
    })

    const { resultsFiles, logFiles } = useMemo(() => {
        const res: JobFile[] = []
        const logs: JobFile[] = []

        approvedFiles?.forEach((f) => {
            if (f.fileType === 'APPROVED-RESULT') res.push(f)
            else if (isApprovedLogType(f.fileType)) logs.push(f)
        })

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
            <Text size="sm" fw={600}>
                {logLabel(file.fileType)}:
            </Text>
            <ViewResultsLink content={file.contents} />
            <span
                style={{
                    height: 16,
                    borderLeft: `1px solid ${theme.colors.charcoal[4]}`,
                }}
            ></span>
            <DownloadBlobLink target="_blank" filename={file.path} fileContent={file.contents} />
        </Group>
    )
}
