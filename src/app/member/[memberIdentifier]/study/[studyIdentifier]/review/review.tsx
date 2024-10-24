'use client'

import React from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Flex } from '@mantine/core'
import { AlertNotFound, ErrorAlert } from '@/components/errors'
import { useRouter } from 'next/navigation'
import { updateStudyStatusAction } from './actions'
import type { StudyStatus } from '@/database/types'

type Study = {
    id: string
}

export const ReviewControls: React.FC<{ study?: Study; memberIdentifier: string }> = ({ memberIdentifier, study }) => {
    const router = useRouter()

    const backPath = `/member/${memberIdentifier}/studies/review`

    const {
        mutate: updateStudy,
        isPending,
        error,
    } = useMutation({
        mutationFn: (status: StudyStatus) => updateStudyStatusAction(study?.id || '', status),
        onSettled(error) {
            if (!error) {
                router.push(backPath)
            }
        },
    })

    if (!study) return <AlertNotFound title="no study found" message="the study was not found" />
    if (error) return <ErrorAlert error={error} />

    return (
        <Flex gap="md">
            <Button color="red" onClick={() => updateStudy('changes-requested')} loading={isPending}>
                Request Changes
            </Button>
            <Button color="blue" onClick={() => updateStudy('approved')} loading={isPending}>
                Approve
            </Button>
        </Flex>
    )
}
