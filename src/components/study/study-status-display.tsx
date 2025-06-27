import { StudyStatus } from '@/database/types'
import { CheckCircleIcon, XCircleIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { Group, Text } from '@mantine/core'
import { FC } from 'react'

const StudyStatusDisplay: FC<{ status: StudyStatus; date?: Date | null }> = ({ status, date }) => {
    const allowedStatuses: StudyStatus[] = ['APPROVED', 'REJECTED']
    if (!date || !status || !allowedStatuses.includes(status)) return null

    const color = status === 'APPROVED' ? 'green.9' : 'red.9'
    const statusDisplay = status === 'APPROVED' ? 'Approved' : 'Rejected'

    return (
        <Group c={color} gap="xs" align="center">
            {status === 'APPROVED' ? (
                <CheckCircleIcon weight="fill" size={24} />
            ) : (
                <XCircleIcon weight="fill" size={24} />
            )}
            <Text fz="xs" fw={600} c={color}>
                {statusDisplay} on {dayjs(date).format('MMM DD, YYYY')}
            </Text>
        </Group>
    )
}

export default StudyStatusDisplay
