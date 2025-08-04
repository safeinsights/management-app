import { CheckCircleIcon, XCircleIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { Group, Text } from '@mantine/core'
import { FC } from 'react'
import { type AllStatus } from '@/lib/types'
import { LatestJobForStudy } from '@/server/db/queries'
import { ResubmitCodeButton } from '@/app/researcher/study/[studyId]/resubmit/resubmit-code-btn'

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

export const CodeApprovalStatus: FC<{ job: LatestJobForStudy }> = ({ job }) => {
    const codeStatusChange = job.statusChanges.find((statusChange) => {
        return statusChange.status === 'CODE-APPROVED' || statusChange.status === 'CODE-REJECTED'
    })

    if (!codeStatusChange) {
        return null
    }

    return <JobApprovalStatus statusChange={codeStatusChange} />
}

export const FileApprovalStatus: FC<{ job: LatestJobForStudy }> = ({ job }) => {
    const filesStatusChange = job.statusChanges.find((statusChange) => {
        return statusChange.status === 'FILES-APPROVED' || statusChange.status === 'FILES-REJECTED'
    })

    if (!filesStatusChange) {
        return null
    }

    if (filesStatusChange.status === 'FILES-REJECTED') {
        return <ResubmitCodeButton job={job} />
    }

    return <JobApprovalStatus statusChange={filesStatusChange} />
}
