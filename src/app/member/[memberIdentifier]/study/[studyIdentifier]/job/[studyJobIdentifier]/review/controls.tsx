'use client'

import React from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Flex } from '@mantine/core'
import { useRouter } from 'next/navigation'
import { ErrorAlert } from '@/components/errors'
import type { StudyJobStatus } from '@/database/types'
import { MinimalJobInfo } from '@/lib/types'
import { updateStudyJobStatusAction } from '@/server/actions/study-job-actions'

export const ReviewControls: React.FC<{ job: MinimalJobInfo; memberIdentifier: string }> = ({
    memberIdentifier,
    job,
}) => {
    const router = useRouter()

    const backPath = `/member/${memberIdentifier}/dashboard`

    const {
        mutate: updateStudyJob,
        isPending,
        error,
    } = useMutation({
        mutationFn: (status: StudyJobStatus) => updateStudyJobStatusAction(job, status),
        onSettled(error) {
            if (!error) {
                router.push(backPath)
            }
        },
    })
    if (error) return <ErrorAlert error={error} />

    return (
        <Flex gap="md">
            <Button color="red" onClick={() => updateStudyJob('CODE-REJECTED')} loading={isPending}>
                Reject
            </Button>
            <Button color="blue" onClick={() => updateStudyJob('JOB-READY')} loading={isPending}>
                Approve
            </Button>
        </Flex>
    )
}
