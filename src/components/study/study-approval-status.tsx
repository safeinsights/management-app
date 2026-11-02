import { StudyStatus } from '@/database/types'
import { CheckCircleIcon, XCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { Group, Text } from '@mantine/core'
import { LocalDateTime } from '@/components/local-date-time'
import { FC } from 'react'
import { fontWeight, semanticColor } from '@/theme/tokens'

const StudyApprovalStatus: FC<{ status: StudyStatus; date?: Date | null }> = ({ status, date }) => {
    const allowedStatuses: StudyStatus[] = ['APPROVED', 'REJECTED']
    if (!date || !status || !allowedStatuses.includes(status)) return null

    const color = semanticColor(status === 'APPROVED' ? 'success.text' : 'error.text')
    const statusDisplay = status === 'APPROVED' ? 'Approved' : 'Rejected'

    return (
        <Group c={color} gap="xs" align="center" wrap="nowrap">
            {status === 'APPROVED' ? (
                <CheckCircleIcon weight="fill" size={24} />
            ) : (
                <XCircleIcon weight="fill" size={24} />
            )}
            <Text fz="xs" fw={fontWeight.semibold} c={color}>
                {statusDisplay}
                <LocalDateTime value={date} prefix=" on " />
            </Text>
        </Group>
    )
}

export default StudyApprovalStatus
