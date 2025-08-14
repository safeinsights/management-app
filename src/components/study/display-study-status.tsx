'use client'

import { StudyJobStatus, StudyStatus } from '@/database/types'
import { RESEARCHER_STATUS_LABELS, REVIEWER_STATUS_LABELS, StatusLabel } from '@/lib/status-labels'
import { Flex, Stack, Text, Tooltip } from '@mantine/core'
import { usePathname } from 'next/navigation'
import React, { FC } from 'react'

const StatusBlock: React.FC<StatusLabel> = ({ type, label, tooltip }) => {
    const color = label === 'Errored' || label === 'Awaiting Review' ? 'red.9' : 'dark.8'
    return (
        <Stack gap="0">
            {type && (
                <Text size="xs" c="grey.7">
                    {type}
                </Text>
            )}
            <Flex align="center" gap="xs">
                <Tooltip label={tooltip} multiline styles={{ tooltip: { maxWidth: 250 } }}>
                    <Text c={color} style={{ cursor: 'pointer' }}>
                        {label}
                    </Text>
                </Tooltip>
            </Flex>
        </Stack>
    )
}

export const DisplayStudyStatus: FC<{
    studyStatus: StudyStatus
    jobStatus: StudyJobStatus | null
}> = ({ studyStatus, jobStatus }) => {
    const pathname = usePathname()

    // Determine which status labels to use based on URL path
    const isReviewerPath = pathname.startsWith('/reviewer/')
    const statusLabels = isReviewerPath ? REVIEWER_STATUS_LABELS : RESEARCHER_STATUS_LABELS
    const hasReviewedFiles = jobStatus === 'FILES-APPROVED' || jobStatus === 'FILES-REJECTED'

    let status = jobStatus || studyStatus
    // do not show job errored status for researchers until the reviewer approves or rejects error log sharing
    if (!isReviewerPath && jobStatus === 'JOB-ERRORED' && !hasReviewedFiles) {
        status = studyStatus
    }

    // If job status is provided but not mapped, fall back to study status
    if (jobStatus && !statusLabels[jobStatus]) {
        status = studyStatus
    }

    const props = statusLabels[status]

    return props ? <StatusBlock {...props} /> : null
}
