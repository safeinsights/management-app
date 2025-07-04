'use client'

import React, { FC } from 'react'
import { Badge, Stack, Text } from '@mantine/core'
import { loadStudyJobAction } from '@/server/actions/study-job.actions'
import { StudyJob } from '@/schema/study'
import { useQuery } from '@tanstack/react-query'
import { DownloadIcon } from '@phosphor-icons/react/dist/ssr'
import { studyCodeURL } from '@/lib/paths'

export const StudyCodeDetails: FC<{ job: StudyJob }> = ({ job }) => {
    const { data, isLoading } = useQuery({
        queryKey: ['studyJobFiles', job.id],
        enabled: !!job.id,
        queryFn: () => loadStudyJobAction(job.id),
    })

    if (isLoading || !data) return <Text>Loading files...</Text>

    if (!data.files?.length) {
        return (
            <Stack>
                <Text c="dimmed" size="sm">
                    No code files have been uploaded for this job yet.
                </Text>
            </Stack>
        )
    }

    const fileNames = data.files.reduce((acc, file) => {
        if (file.fileType === 'MAIN-CODE' || file.fileType === 'SUPPLEMENTAL-CODE') {
            acc.push(file.name)
        }
        return acc
    }, [] as string[])

    const fileChips = fileNames.map((fileName) => {
        return (
            <Badge
                color="#D4D1F3"
                c="black"
                component="a"
                href={studyCodeURL(job.id, fileName)}
                target="_blank"
                rightSection={<DownloadIcon />}
                style={{ cursor: 'pointer' }}
                key={fileName}
            >
                {fileName}
            </Badge>
        )
    })

    return (
        <Stack>
            <Text>View the code files that you uploaded to run against the dataset.</Text>
            {job && <Stack>{fileChips}</Stack>}
        </Stack>
    )
}
