import { StudyStatus } from '@/database/types'
import { CheckCircle, XCircle } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { Group, Text } from '@mantine/core'
import { FC } from 'react'
import { capitalize } from 'remeda'

const StudyStatusDisplay: FC<{ status: StudyStatus; date?: Date | null }> = ({ status, date }) => {
    if (!date) return null

    const color = status === 'APPROVED' ? 'green.9' : 'red.9'

    return (
        <Group c={color} gap="0.5rem" align="center">
            {status === 'APPROVED' ? <CheckCircle weight="fill" size={24} /> : <XCircle weight="fill" size={24} />}
            <Text fz="xs" fw={600} c={color}>
                {capitalize(status.toLowerCase())} on {dayjs(date).format('MMM DD, YYYY')}
            </Text>
        </Group>
    )
}

export default StudyStatusDisplay
