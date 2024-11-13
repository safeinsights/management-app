'use client'

import React from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Group, Flex } from '@mantine/core'
import { AlertNotFound, ErrorAlert } from '@/components/errors'
import { useRouter } from 'next/navigation'
import { updateStudyStatusAction } from './actions'
import type { StudyStatus } from '@/database/types'

type Study = {
    id: string
    title: string
    piName: string
    description: string
    irbDocument: string
    highlights: boolean
    eventCapture: boolean
    containerLocation: string
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
        <>
            <Flex>
                <Group gap="xl" p={2} mt={30} justify="flex-end">
                    {/* Commentng this out for now since it's not part of the pilot*/}
                    {/* <Button color="red" onClick={() => updateStudy('REJECTED')} loading={isPending}>
                        Reject
                    </Button> */}
                    <Button color="blue" onClick={() => updateStudy('APPROVED')} loading={isPending}>
                        Approve Code & Study Proposal
                    </Button>
                </Group>
            </Flex>
        </>
    )
}
