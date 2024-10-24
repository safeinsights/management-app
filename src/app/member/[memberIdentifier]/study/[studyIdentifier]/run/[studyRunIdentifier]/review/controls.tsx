'use client'

import React from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Flex } from '@mantine/core'
import { useRouter } from 'next/navigation'
import { ErrorAlert } from '@/components/errors'
import { updateStudyRunStatusAction } from './actions'
import type { StudyRunStatus } from '@/database/types'
import { CodeFileMinimalRun } from '@/lib/types'

export const ReviewControls: React.FC<{ run: CodeFileMinimalRun; memberIdentifier: string }> = ({
    memberIdentifier,
    run,
}) => {
    const router = useRouter()

    const backPath = `/member/${memberIdentifier}/studies/review`

    const {
        mutate: updateStudyRun,
        isPending,
        error,
    } = useMutation({
        mutationFn: (status: StudyRunStatus) => updateStudyRunStatusAction(run, status),
        onSettled(error) {
            if (!error) {
                router.push(backPath)
            }
        },
    })
    if (error) return <ErrorAlert error={error} />

    return (
        <Flex gap="md">
            <Button color="red" onClick={() => updateStudyRun('code-rejected')} loading={isPending}>
                Reject
            </Button>
            <Button color="blue" onClick={() => updateStudyRun('in-queue')} loading={isPending}>
                Approve
            </Button>
        </Flex>
    )
}
