import { CheckCircleIcon, XCircleIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { Group, Text } from '@mantine/core'
import { FC } from 'react'
import { type StudyJobStatus } from '@/database/types'
import { type AllStatus } from '@/lib/types'

const allowedStatuses: AllStatus[] = ['CODE-APPROVED', 'CODE-REJECTED', 'FILES-APPROVED', 'FILES-REJECTED']

type Status = { status: AllStatus; createdAt: Date | string }

const JobApprovalStatus: FC<{ statusChange: Status }> = ({ statusChange }) => {
    if (!statusChange || !allowedStatuses.includes(statusChange.status)) {
        return null
    }

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

// Only the status history is read, so the prop is narrowed to that rather than the whole job: adding
// a selected column to the query should not ripple out into every caller of this component.
export const ApprovalStatus: FC<{
    job: { statusChanges: ReadonlyArray<{ status: StudyJobStatus; createdAt: Date | string }> }
    orgSlug: string
    type: 'code' | 'files'
}> = ({ job, type }) => {
    const statusPair =
        type === 'code'
            ? (['CODE-APPROVED', 'CODE-REJECTED'] as const)
            : (['FILES-APPROVED', 'FILES-REJECTED'] as const)

    const statusChange = job.statusChanges.find((statusChange) => {
        return statusChange.status === statusPair[0] || statusChange.status === statusPair[1]
    })

    //  check if any status change is CODE-REJECTED (since find returns first match)
    const codeRejectedStatusChange = job.statusChanges.find((statusChange) => statusChange.status === 'CODE-REJECTED')

    const finalStatusChange = statusChange ?? codeRejectedStatusChange

    if (!finalStatusChange) {
        return null
    }

    return <JobApprovalStatus statusChange={finalStatusChange} />
}
