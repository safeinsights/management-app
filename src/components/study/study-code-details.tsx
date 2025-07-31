'use client'

import React, { FC } from 'react'
import { Stack } from '@mantine/core'
import { Title } from '@mantine/core'
import { StudyCodeIteration } from './study-code-iteration'
import { StudyJob } from '@/schema/study'

export const StudyCodeDetails: FC<{ jobs: StudyJob[] }> = ({ jobs }) => {
    return (
        <Stack>
            {jobs.map((job, index) => {
                const iteration = jobs.length - index
                const isCurrent = index === 0

                return (
                    <Stack key={job.id}>
                        <Title order={5}>{isCurrent ? 'Current Iteration' : `Iteration ${iteration}`}</Title>
                        <StudyCodeIteration job={job} />
                    </Stack>
                )
            })}
        </Stack>
    )
}
