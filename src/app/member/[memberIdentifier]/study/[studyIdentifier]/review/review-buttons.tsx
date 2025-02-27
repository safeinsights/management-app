'use client'

import React, { FC } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Group, Text } from '@mantine/core'
import { AlertNotFound, ErrorAlert } from '@/components/errors'
import { useRouter } from 'next/navigation'
import type { StudyStatus } from '@/database/types'
import { updateStudyStatusAction } from '@/server/actions/study-actions'
import { Study } from '@/schema/study'

export const ReviewControls: FC<{ study: Study; memberIdentifier: string }> = ({ memberIdentifier, study }) => {
    const router = useRouter()

    const backPath = `/member/${memberIdentifier}/dashboard`

    const {
        mutate: updateStudy,
        isPending,
        error,
    } = useMutation({
        mutationFn: (status: StudyStatus) => updateStudyStatusAction(study.id, status),
        onSettled(error) {
            if (!error) {
                router.push(backPath)
            }
        },
    })

    // TODO Do we want to support approved/rejected at timestamps?
    if (study.status === 'APPROVED') {
        return <Text>Approved</Text>
    }

    if (study.status === 'REJECTED') {
        return <Text>Rejected</Text>
    }

    if (!study) return <AlertNotFound title="No study found" message="The study was not found" />
    if (error) return <ErrorAlert error={error} />

    return (
        <Group>
            <Button onClick={() => updateStudy('REJECTED')} loading={isPending} variant="outline">
                Reject
            </Button>
            <Button onClick={() => updateStudy('APPROVED')} loading={isPending}>
                Approve
            </Button>
        </Group>
    )
}
