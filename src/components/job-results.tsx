'use client'

import { FC } from 'react'
import { Group, Stack, Text, useMantineTheme } from '@mantine/core'
import { JobFile } from '@/lib/types'
import { DownloadResultsLink, ViewResultsLink } from './links'
import { LatestJobForStudy } from '@/server/db/queries'
import { Title } from '@mantine/core'
import { JobResultsIteration } from './job-results-iteration'

export const JobResults: FC<{ jobs: LatestJobForStudy[] }> = ({ jobs }) => {
    return (
        <Stack>
            {jobs.map((job, index) => {
                const iteration = jobs.length - index
                const isCurrent = index === 0

                return (
                    <Stack key={job.id}>
                        <Title order={5}>{isCurrent ? null : `Logs - Iteration ${iteration}`}</Title>
                        <JobResultsIteration job={job} />
                    </Stack>
                )
            })}
        </Stack>
    )
}

export const ViewFile: FC<{ file: JobFile }> = ({ file }) => {
    const theme = useMantineTheme()
    return (
        <Group gap="xs">
            <Text fz="sm" fw={600}>
                {file.fileType === 'APPROVED-RESULT' ? 'Results:' : 'Logs:'}
            </Text>
            <ViewResultsLink content={file.contents} />
            <span
                style={{
                    height: 16,
                    borderLeft: `1px solid ${theme.colors.charcoal[4]}`,
                }}
            ></span>
            <DownloadResultsLink target="_blank" filename={file.path} content={file.contents} />
        </Group>
    )
}
