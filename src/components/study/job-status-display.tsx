import { StudyJobStatus } from '@/database/types'
import { CheckCircle, XCircle } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { Group, Text } from '@mantine/core'
import { FC } from 'react'

const JobStatusDisplay: FC<{ status?: StudyJobStatus; date?: Date | null }> = ({ status, date }) => {
    const allowedStatuses: StudyJobStatus[] = ['CODE-APPROVED', 'CODE-REJECTED', 'RESULTS-APPROVED', 'RESULTS-REJECTED']
    if (!date || !status || !allowedStatuses.includes(status)) return null

    const isApproved = status === 'CODE-APPROVED' || status === 'RESULTS-APPROVED'

    const color = isApproved ? 'green.9' : 'red.9'
    const statusDisplay = isApproved ? 'Approved' : 'Rejected'

    return (
        <Group c={color} gap="xs" align="center">
            {isApproved ? <CheckCircle weight="fill" size={24} /> : <XCircle weight="fill" size={24} />}
            <Text fz="xs" fw={600} c={color}>
                {statusDisplay} on {dayjs(date).format('MMM DD, YYYY')}
            </Text>
        </Group>
    )
}

export default JobStatusDisplay
