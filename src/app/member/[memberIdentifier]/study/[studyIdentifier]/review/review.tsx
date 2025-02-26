'use client'

import React from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Group, Title } from '@mantine/core'
import { AlertNotFound, ErrorAlert } from '@/components/errors'
import { useRouter } from 'next/navigation'
import type { StudyStatus } from '@/database/types'
import { updateStudyStatusAction } from '@/server/actions/study-actions'
import { Study } from '@/schema/study'

export const ReviewControls: React.FC<{ study: Study; memberIdentifier: string }> = ({ memberIdentifier, study }) => {
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
                // TODO What behavior do we want on approve/reject?
                router.push(backPath)
            }
        },
    })

    if (!study) return <AlertNotFound title="no study found" message="the study was not found" />
    if (error) return <ErrorAlert error={error} />

    return (
        <Group justify="space-between">
            <Title order={4}>Study Proposal</Title>
            <Group>
                <Button onClick={() => updateStudy('REJECTED')} loading={isPending} variant="outline">
                    Reject
                </Button>
                <Button onClick={() => updateStudy('APPROVED')} loading={isPending}>
                    Approve
                </Button>
            </Group>
        </Group>
    )
}
