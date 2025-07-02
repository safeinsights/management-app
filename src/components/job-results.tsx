'use client'

import React, { FC } from 'react'
import { Button, Group, LoadingOverlay, Modal, Stack, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ErrorAlert } from '@/components/errors'
import { fetchApprovedJobFilesAction } from '@/server/actions/study-job.actions'
import { RenderCSV } from './render-csv'
import { ApprovedFile } from '@/lib/types'
import { useDisclosure } from '@mantine/hooks'
import { DownloadResultsLink, ViewResultsLink } from './links'
import { LatestJobForStudy } from '@/server/db/queries'

export const JobResults: FC<{ job: LatestJobForStudy }> = ({ job }) => {
    const isApproved = !!job.statusChanges.find((sc) => sc.status == 'FILES-APPROVED')

    const {
        data: approvedFiles,
        isLoading,
        isError,
        error,
    } = useQuery({
        enabled: isApproved,
        queryKey: ['job-results', job.id],
        queryFn: async () => await fetchApprovedJobFilesAction(job.id),
    })

    if (!isApproved) {
        return null
    }

    if (isError) {
        return <ErrorAlert error={error} />
    }

    if (isLoading || !approvedFiles) {
        return <LoadingOverlay />
    }

    return (
        <Stack>
            {approvedFiles?.map((approvedFile) => (
                <ApprovedFileEntry approvedFile={approvedFile} key={approvedFile.path} />
            ))}
        </Stack>
    )
}

const ApprovedFileEntry: FC<{ approvedFile: ApprovedFile }> = ({ approvedFile }) => {
    const [opened, { open, close }] = useDisclosure(false)

    return (
        <Group>
            <Title order={4}>{approvedFile.path}</Title>
            <DownloadResultsLink target="_blank" filename={approvedFile.path} content={approvedFile.contents} />
            <ViewResultsLink content={approvedFile.contents} />
            <Modal size="80%" opened={opened} onClose={close} title={approvedFile.path}>
                <RenderCSV csv={new TextDecoder().decode(approvedFile.contents)} />
            </Modal>
            <Button onClick={open}>View Results (in app)</Button>
        </Group>
    )
}
