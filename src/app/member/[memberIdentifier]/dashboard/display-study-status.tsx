import React, { FC } from 'react'
import { StudyJobStatus, StudyStatus } from '@/database/types'
import { Stack, Text } from '@mantine/core'

export const DisplayStudyStatus: FC<{ studyStatus: StudyStatus; jobStatus: StudyJobStatus | null }> = ({
    studyStatus,
    jobStatus,
}) => {
    if (jobStatus === 'JOB-PACKAGING') {
        return (
            <Stack gap="0">
                <Text size="xs" c="#64707C">
                    Code
                </Text>
                <Text>Processing</Text>
            </Stack>
        )
    }

    if (jobStatus === 'JOB-ERRORED') {
        return (
            <Stack gap="0">
                <Text size="xs" c="#64707C">
                    Code
                </Text>
                <Text>Errored</Text>
            </Stack>
        )
    }

    if (jobStatus === 'RUN-COMPLETE') {
        return (
            <Stack gap="0">
                <Text size="xs" c="#64707C">
                    Results
                </Text>
                <Text>Under Review</Text>
            </Stack>
        )
    }

    if (jobStatus === 'RESULTS-REJECTED') {
        return (
            <Stack gap="0">
                <Text size="xs" c="#64707C">
                    Results
                </Text>
                <Text>Rejected</Text>
            </Stack>
        )
    }

    if (jobStatus === 'RESULTS-APPROVED') {
        return (
            <Stack gap="0">
                <Text size="xs" c="#64707C">
                    Results
                </Text>
                <Text>Approved</Text>
            </Stack>
        )
    }

    if (studyStatus === 'PENDING-REVIEW') {
        return (
            <Stack gap="0">
                <Text size="xs" c="#64707C">
                    Proposal
                </Text>
                <Text>Under Review</Text>
            </Stack>
        )
    }

    if (studyStatus === 'APPROVED') {
        return (
            <Stack gap="0">
                <Text size="xs" c="#64707C">
                    Proposal
                </Text>
                <Text>Approved</Text>
            </Stack>
        )
    }

    if (studyStatus === 'REJECTED') {
        return (
            <Stack gap="0">
                <Text size="xs" c="#64707C">
                    Proposal
                </Text>
                <Text>Rejected</Text>
            </Stack>
        )
    }

    return null
}
