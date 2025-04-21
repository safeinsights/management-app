import React, { FC } from 'react'
import { StudyStatus, StudyJobStatus } from '@/database/types'
import { AllStatus } from '@/lib/types'
import { Stack, Text, Popover, PopoverTarget, PopoverDropdown, Flex, ActionIcon } from '@mantine/core'
import { Info } from '@phosphor-icons/react/dist/ssr'
import { CopyingInput } from '@/components/copying-input'

type PopOverComponent = React.FC<{ jobId?: string | null }>

const JobIdPopover: PopOverComponent = ({ jobId }) => {
    if (!jobId) return null

    return (
        <Popover width={200} position="bottom" withArrow shadow="md">
            <PopoverTarget>
                <ActionIcon variant="transparent">
                    <Info color="blue" />
                </ActionIcon>
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
    'RESULTS-REJECTED': { type: 'Results', label: 'Rejected' },
    'RESULTS-APPROVED': { type: 'Results', label: 'Approved' },
    'PENDING-REVIEW': { type: 'Proposal', label: 'Under Review' },
}

const StatusBlock: React.FC<StatusLabels & { jobId?: string | null }> = ({ type, label, jobId, InfoComponent }) => {
    return (
        <Stack gap="0">
            <Text size="xs" c="#64707C">
                {type}
            </Text>
            {InfoComponent && jobId ? (
                <Flex align="center" gap="xs">
                    <Text>{label}</Text>
                    <InfoComponent jobId={jobId} />
                </Flex>
            ) : (
                <Text>{label}</Text>
            )}
        </Stack>
    )
}

export const DisplayStudyStatus: FC<{
    studyStatus: StudyStatus
    jobStatus: StudyJobStatus | null
    jobId?: string | null
}> = ({ studyStatus, jobStatus, jobId }) => {
    if (jobStatus) {
        const props = StatusLabels[jobStatus] || null
        if (props) {
            return <StatusBlock {...props} jobId={jobId} />
        }
    }
    const props = StatusLabels[studyStatus] || null
    if (props) {
        return <StatusBlock {...props} jobId={jobId} />
    }

    return null
}
