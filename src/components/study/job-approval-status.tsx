import { CheckCircleIcon, XCircleIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { Group, Stack, Text } from '@mantine/core'
import { FC } from 'react'
import { type AllStatus } from '@/lib/types'
import { LatestJobForStudy } from '@/server/db/queries'
import { ResubmitButton } from './resubmit-button'

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

export const CodeApprovalStatus: FC<{ job: LatestJobForStudy; orgSlug: string }> = ({ job, orgSlug }) => {
    const codeStatusChange = job.statusChanges.find((statusChange) => {
        return statusChange.status === 'CODE-APPROVED' || statusChange.status === 'CODE-REJECTED'
    })

    if (!codeStatusChange) {
        return null
    }

    if (codeStatusChange.status === 'CODE-REJECTED') {
        return (
            <Stack>
                <Text>
                    This study&apos;s code has not been approved by the data organization. Consider re-submitting an
                    updated study code.
                </Text>
                <ResubmitButton studyId={job.studyId} orgSlug={orgSlug} />
            </Stack>
        )
    }

    return <JobApprovalStatus statusChange={codeStatusChange} />
}

export const FileApprovalStatus: FC<{ job: LatestJobForStudy; orgSlug: string }> = ({ job, orgSlug }) => {
    const hasBeenReviewed = job.statusChanges.find((statusChange) => {
        return statusChange.status === 'FILES-APPROVED' || statusChange.status === 'FILES-REJECTED'
    })

    const hasErrored = job.statusChanges.some((statusChange) => statusChange.status === 'JOB-ERRORED')

    if (!hasBeenReviewed) {
        return null
    }

    if (hasBeenReviewed && hasErrored) {
        return <ResubmitButton studyId={job.studyId} orgSlug={orgSlug} />
    }

    return <JobApprovalStatus statusChange={hasBeenReviewed} />
}
