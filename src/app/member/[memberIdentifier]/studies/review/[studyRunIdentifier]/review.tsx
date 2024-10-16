'use client'

import React from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Flex } from '@mantine/core'
import { AlertNotFound, ErrorAlert } from '@/components/errors'
import { useRouter } from 'next/navigation'
import { approveStudyRunAction } from './actions'

type Run = {
    id: string
}

export const Review: React.FC<{ run?: Run; memberIdentifier: string }> = ({ memberIdentifier, run }) => {
    const router = useRouter()

    const backPath = `/member/${memberIdentifier}/studies/review`

    const {
        mutate: approveStudy,
        isPending,
        error,
    } = useMutation({
        mutationFn: () => approveStudyRunAction(run?.id || ''),
        onSettled(error) {
            if (!error) {
                router.push(backPath)
            }
        },
    })

    if (!run) return <AlertNotFound title="no run found" message="the run was not found" />
    if (error) return <ErrorAlert error={error} />

    return (
        <Flex direction="column">
            <textarea
                readOnly
                style={{ width: '100%', height: 400, padding: 30 }}
                defaultValue={`code for run ${run.id} goes here or something...`}
            />
            <Flex justify="end" mt="lg">
                <Button color="blue" onClick={() => approveStudy()} loading={isPending}>
                    Approve
                </Button>
            </Flex>
        </Flex>
    )
}
