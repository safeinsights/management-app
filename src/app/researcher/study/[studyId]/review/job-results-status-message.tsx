'use client'

import React, { FC } from 'react'
import { Group, Text } from '@mantine/core'
import { LatestJobForStudy } from '@/server/db/queries'
import { useJobResultsStatus } from '@/components/use-job-results-status'
import { CopyingInput } from '@/components/copying-input'

interface ErroredProps {
    isApproved: boolean
    isRejected: boolean
    jobId: string
}

export const JobResultsStatusMessage: FC<{ job: LatestJobForStudy }> = ({ job }) => {
    const { isApproved, isRejected, isComplete, isErrored } = useJobResultsStatus(job.statusChanges)

    if (isErrored) {
        return <Errored isApproved={isApproved} isRejected={isRejected} jobId={job.id} />
    }

    if (isComplete) {
        if (isApproved) {
            return <Text>The results of your study have been approved and are now available to you!</Text>
        }

        if (isRejected) {
            return (
                <Text>
                    The results of your study have not been released by the data organization, possibly due to the
                    presence of personally identifiable information (PII). Consider contacting the data organization for
                    further guidance.
                </Text>
            )
        }
    }

    return <Text>Study results will become available once the data organization reviews and approves them.</Text>
}

const Errored: FC<ErroredProps> = ({ isApproved, isRejected, jobId }) => {
    let message: string | null = null
    if (isApproved) {
        message = 'The code errored out! Review error logs and consider re-submitting an updated study code.'
    } else if (isRejected) {
        message =
            'The code errored out! While logs are not available at this time, consider re-submitting an updated study code.'
    }
    return (
        <>
            {message && <Text>{message}</Text>}
            <Group justify="flex-start" align="center">
                <Text size="xs" fw="bold">
                    Job ID:
                </Text>
                <CopyingInput value={jobId} tooltipLabel="Copy" />
            </Group>
        </>
    )
}
