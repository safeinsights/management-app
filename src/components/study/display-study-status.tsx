'use client'

import { CopyingInput } from '@/components/copying-input'
import { StudyJobStatus, StudyStatus } from '@/database/types'
import { AllStatus } from '@/lib/types'
import { Flex, Popover, PopoverDropdown, PopoverTarget, Stack, Text } from '@mantine/core'
import { InfoIcon } from '../icons'
import React, { FC } from 'react'

type PopOverComponent = React.FC<{ jobId?: string | null }>

const JobIdPopover: PopOverComponent = ({ jobId }) => {
    if (!jobId) return null

    return (
        <Popover width={200} position="bottom" withArrow shadow="md">
            <PopoverTarget>
                <div style={{ cursor: 'pointer' }}>
                    <InfoIcon />
                </div>
            </PopoverTarget>
            <PopoverDropdown miw={'350px'}>
                <Text size="xs" fw="bold">
                    Job ID to share with support
                </Text>
                <CopyingInput value={jobId} tooltipLabel="Copy JobId" />
            </PopoverDropdown>
        </Popover>
    )
}

type StatusLabels = {
    type: 'Code' | 'Results' | 'Proposal'
    label: string
    InfoComponent?: PopOverComponent
}

const StatusLabels: Partial<Record<AllStatus, StatusLabels>> = {
    APPROVED: { type: 'Proposal', label: 'Approved' },
    REJECTED: { type: 'Proposal', label: 'Rejected' },
    'JOB-PACKAGING': { type: 'Code', label: 'Processing' },
    'JOB-RUNNING': { type: 'Code', label: 'Running' },
    'JOB-ERRORED': { type: 'Code', label: 'Errored', InfoComponent: JobIdPopover },
    'RUN-COMPLETE': { type: 'Results', label: 'Under Review' },
    'FILES-REJECTED': { type: 'Results', label: 'Rejected' },
    'FILES-APPROVED': { type: 'Results', label: 'Approved' },
    'PENDING-REVIEW': { type: 'Proposal', label: 'Under Review' },
}

const StatusBlock: React.FC<StatusLabels & { jobId?: string | null }> = ({ type, label, jobId, InfoComponent }) => {
    const color =
        [StatusLabels['RUN-COMPLETE']?.label, StatusLabels['PENDING-REVIEW']?.label].indexOf(label) > -1
            ? 'red.9'
            : 'dark.8'
    return (
        <Stack gap="0">
            <Text size="xs" c="grey.7">
                {type}
            </Text>
            {InfoComponent && jobId ? (
                <Flex align="center" gap="xs">
                    <Text>{label}</Text>
                    <InfoComponent jobId={jobId} />
                </Flex>
            ) : (
                <Text c={color}>{label}</Text>
            )}
        </Stack>
    )
}

export const DisplayStudyStatus: FC<{
    studyStatus: StudyStatus
    jobStatus: StudyJobStatus | null
    jobId?: string | null
}> = ({ studyStatus, jobStatus, jobId }) => {
    const statusToDisplay = jobStatus ?? studyStatus
    const props = StatusLabels[statusToDisplay]

    return props ? <StatusBlock {...props} jobId={jobId} /> : null
}
