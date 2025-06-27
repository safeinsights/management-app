import { CheckCircleIcon, XCircleIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { Group, Text } from '@mantine/core'
import { FC } from 'react'
import { type AllStatus } from '@/lib/types'

const allowedStatuses: AllStatus[] = ['CODE-APPROVED', 'CODE-REJECTED', 'FILES-APPROVED', 'FILES-REJECTED']

type Status = { status: AllStatus; createdAt: Date | string }

const JobStatusDisplay: FC<{ statusChange?: Status }> = ({ statusChange }) => {
    if (!statusChange || !allowedStatuses.includes(statusChange.status)) return null

    const isApproved = statusChange.status === 'CODE-APPROVED' || statusChange.status === 'FILES-APPROVED'

    const color = isApproved ? 'green.9' : 'red.9'
    const statusDisplay = isApproved ? 'Approved' : 'Rejected'

    return (
        <Group c={color} gap="xs" align="center">
            {isApproved ? <CheckCircleIcon weight="fill" size={24} /> : <XCircleIcon weight="fill" size={24} />}
            <Text fz="xs" fw={600} c={color}>
                {statusDisplay} on {dayjs(statusChange.createdAt).format('MMM DD, YYYY')}
            </Text>
        </Group>
    )
}

export default JobStatusDisplay
