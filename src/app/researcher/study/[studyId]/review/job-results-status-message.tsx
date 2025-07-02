'use client'

import React, { FC } from 'react'
import { Text } from '@mantine/core'
import { LatestJobForStudy } from '@/server/db/queries'

export const JobResultsStatusMessage: FC<{ job: LatestJobForStudy }> = ({ job }) => {
    const isApproved = !!job.statusChanges.find((sc) => sc.status === 'FILES-APPROVED')
    const isRejected = !!job.statusChanges.find((sc) => sc.status === 'FILES-REJECTED')
    const isComplete = !!job.statusChanges.find((sc) => sc.status === 'RUN-COMPLETE')
    const isErrored = !!job.statusChanges.find((sc) => sc.status === 'JOB-ERRORED')

    if (isErrored) {
        if (isApproved) {
            return (
                <Text>The code errored out! Review error logs and consider re-submitting an updated study code.</Text>
            )
        }

        if (isRejected) {
            return (
                <Text>
                    The code errored out! While logs are not available at this time, consider re-submitting an updated
                    study code.
                </Text>
            )
        }
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
