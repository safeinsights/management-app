'use client'

import React, { FC, Fragment } from 'react'
import { Button, Group, LoadingOverlay, Modal, Stack, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ErrorAlert } from '@/components/errors'
import { fetchApprovedJobFilesAction } from '@/server/actions/study-job.actions'
import { RenderCSV } from './render-csv'
import { ApprovedFile } from '@/lib/types'
import { useDisclosure } from '@mantine/hooks'
import { DownloadResultsLink, ViewResultsLink } from './links'
import { LatestJobForStudy } from '@/server/db/queries'

export const ViewJobResultsCSV: FC<{ job: LatestJobForStudy }> = ({ job }) => {
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
        const hasEncryptedLog = job.files.some((jobFile) => jobFile.fileType === 'ENCRYPTED-LOG')
        if (hasEncryptedLog) {
            return (
                <Text>
                    The code errored out! While logs are not available at this time, consider re-submitting an updated
                    study code.
                </Text>
            )
        }

        const hasEncryptedResults = job.files.some((jobFile) => jobFile.fileType === 'ENCRYPTED-RESULT')
        if (hasEncryptedResults) {
            return (
                <Text>
                    he results of your study have not been released by the data organization, possibly due to the
                    presence of personally identifiable information (PII). Consider contacting the data organization for
                    further guidance.
                </Text>
            )
        }

        return <Text>Study results will become available once the data organization reviews and approves them.</Text>
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
                <Fragment key={approvedFile.path}>
                    <JobStatusText approvedFile={approvedFile} />
                    <ApprovedFileEntry approvedFile={approvedFile} />
                </Fragment>
            ))}
        </Stack>
    )
}

const JobStatusText: FC<{ approvedFile: ApprovedFile }> = ({ approvedFile }) => {
    if (approvedFile.fileType === 'APPROVED-LOG') {
        return <Text>The code errored out! Review error logs and consider re-submitting an updated study code.</Text>
    }

    if (approvedFile.fileType === 'APPROVED-RESULT') {
        return <Text>The results of your study have been approved and are now available to you!</Text>
    }

    return null
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
