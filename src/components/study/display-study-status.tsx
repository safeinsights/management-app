'use client'

import { StudyJobStatus, StudyStatus } from '@/database/types'
import { titleize } from '@/lib/string'
import { Flex, Popover, PopoverDropdown, PopoverTarget, Stack, Text } from '@mantine/core'
import { InfoIcon } from '../icons'
import React, { FC } from 'react'
import { StatusLabel, REVIEWER_STATUS_LABELS, RESEARCHER_STATUS_LABELS } from '@/lib/status-labels'
import { usePathname } from 'next/navigation'

const TooltipPopover: FC<{ tooltip: string }> = ({ tooltip }) => {
    return (
        <Popover width={200} position="bottom" withArrow shadow="md">
            <PopoverTarget>
                <div style={{ cursor: 'pointer' }}>
                    <InfoIcon />
                </div>
            </PopoverTarget>
            <PopoverDropdown miw={'350px'}>
                <Text size="xs" fw="bold">
                    {tooltip}
                </Text>
            </PopoverDropdown>
        </Popover>
    )
}

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
                <Text c={color}>{label}</Text>
                {tooltip && <TooltipPopover tooltip={tooltip} />}
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

    const status = jobStatus || studyStatus
    let props = statusLabels[status]

    if (!props) {
        // Fallback for statuses not in the labels
        props = {
            label: titleize(status.replace(/-/g, ' ')),
        }
    }

    return props ? <StatusBlock {...props} /> : null
}
