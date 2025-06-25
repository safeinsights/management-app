import { CheckCircle, XCircle } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { Group, Text } from '@mantine/core'
import { FC } from 'react'
import { type AllStatus } from '@/lib/types'

const allowedStatuses: AllStatus[] = ['CODE-APPROVED', 'CODE-REJECTED', 'RESULTS-APPROVED', 'RESULTS-REJECTED']

type Status = { status: AllStatus; createdAt: Date | string }

const JobStatusDisplay: FC<{ statusChange?: Status }> = ({ statusChange }) => {
    if (!statusChange || !allowedStatuses.includes(statusChange.status)) return null

    const isApproved = statusChange.status === 'CODE-APPROVED' || statusChange.status === 'RESULTS-APPROVED'

    const color = isApproved ? 'green.9' : 'red.9'
    const statusDisplay = isApproved ? 'Approved' : 'Rejected'

    return (
        <Group c={color} gap="xs" align="center">
            {isApproved ? <CheckCircle weight="fill" size={24} /> : <XCircle weight="fill" size={24} />}
            <Text fz="xs" fw={600} c={color}>
                {statusDisplay} on {dayjs(statusChange.createdAt).format('MMM DD, YYYY')}
            </Text>
        </Group>
    )
}

export default JobStatusDisplay
