'use client'

import React, { FC } from 'react'
import { Group, Text } from '@mantine/core'
import { LatestJobForStudy } from '@/server/db/queries'
import { useJobResultsStatus } from '@/components/use-job-results-status'
import { CopyingInput } from '@/components/copying-input'

export const JobResultsStatusMessage: FC<{ job: LatestJobForStudy }> = ({ job }) => {
    const { isApproved, isRejected, isComplete, isErrored } = useJobResultsStatus(job.statusChanges)

    if (isErrored) {
        return (
            <>
                {isApproved ? (
                    <Text>
                        The code errored out! Review error logs and consider re-submitting an updated study code.
                    </Text>
                ) : isRejected ? (
                    <Text>
                        The code errored out! While logs are not available at this time, consider re-submitting an
                        updated study code.
                    </Text>
                ) : null}

                <Group justify="flex-start" align="center">
                    <Text size="xs" fw="bold">
                        Job ID:
                    </Text>
                    <CopyingInput value={job.id} tooltipLabel="Copy" />
                </Group>
            </>
        )
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
