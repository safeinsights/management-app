'use client'

import React, { FC } from 'react'
import { Button, Group, LoadingOverlay, Modal, Stack, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ErrorAlert } from '@/components/errors'
import { fetchApprovedJobFilesAction } from '@/server/actions/study-job.actions'
import { RenderCSV } from './render-csv'
import { JobFile } from '@/lib/types'
import { useDisclosure } from '@mantine/hooks'
import { DownloadResultsLink, ViewResultsLink } from './links'
import { LatestJobForStudy } from '@/server/db/queries'
import { RenderLogs } from '@/components/render-logs'

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

    if (isError) {
        return <ErrorAlert error={error} />
    }

    if (isLoading || !approvedFiles) {
        return <LoadingOverlay />
    }

    return (
        <Stack>
            {approvedFiles?.map((approvedFile) => (
                <ViewFile file={approvedFile} key={approvedFile.path} />
            ))}
        </Stack>
    )
}

export const ViewFile: FC<{ file: JobFile }> = ({ file }) => {
    const [opened, { open, close }] = useDisclosure(false)
    const fileContents = new TextDecoder().decode(file.contents)

    return (
        <Group>
            <Title order={4}>{file.path}</Title>
            <DownloadResultsLink target="_blank" filename={file.path} content={file.contents} />
            <ViewResultsLink content={file.contents} />
            <Modal size="80%" opened={opened} onClose={close} title={file.path}>
                {file.fileType === 'APPROVED-LOG' ? (
                    <RenderLogs logs={fileContents} />
                ) : (
                    <RenderCSV csv={fileContents} />
                )}
            </Modal>
            <Button onClick={open}>View Results (in app)</Button>
        </Group>
    )
}
