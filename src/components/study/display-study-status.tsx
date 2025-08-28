'use client'

import { type StudyStatus } from '@/database/types'
import { useStudyStatus, type MinimalStatusChange } from '@/hooks/use-study-status'
import { Flex, Stack, Text, Tooltip } from '@mantine/core'
import React, { FC } from 'react'

export const DisplayStudyStatus: FC<{
    studyStatus: StudyStatus
    audience: 'reviewer' | 'researcher'
    jobStatusChanges: MinimalStatusChange[]
}> = ({ audience, studyStatus, jobStatusChanges }) => {
    const statusLabel = useStudyStatus({
        studyStatus,
        audience,
        jobStatusChanges,
    })

    if (!statusLabel) {
        return null
    }

    const { type, label, tooltip } = statusLabel
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
