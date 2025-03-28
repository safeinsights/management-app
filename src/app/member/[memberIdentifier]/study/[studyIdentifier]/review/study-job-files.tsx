'use client'

import React, { FC } from 'react'
import { Badge, Stack, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Download } from '@phosphor-icons/react/dist/ssr'
import { StudyJob } from '@/schema/study'
import { dataForJobAction } from '@/server/actions/study-job.actions'

export const StudyJobFiles: FC<{ job: StudyJob }> = ({ job }) => {
    const { data, isLoading } = useQuery({
        queryKey: ['studyJobFiles', job.id],
        queryFn: () => dataForJobAction(job.id),
    })

    if (isLoading) return <Text>Loading files...</Text>

    if (!data || Object.keys(data?.manifest?.files || {}).length === 0) {
        return (
            <Stack>
                <Text c="dimmed" size="sm">
                    No code files have been uploaded for this job yet.
                </Text>
            </Stack>
        )
    }


    const fileNames = Object.keys(data?.manifest.files || {})


    const fileChips = fileNames.map((fileName) => {
        const downloadUrl = data.jobInfo
            ? `/analysis/${data.jobInfo.memberIdentifier}/${data.jobInfo.studyId}/${data.jobInfo.studyJobId}/code/${fileName}`
            : '#'
        return (
            <Badge
                color="#D4D1F3"
                c="black"
                component="a"
                href={downloadUrl}
                target="_blank"
                rightSection={<Download />}
                style={{ cursor: 'pointer' }}
                key={fileName}
            >
                {fileName}
            </Badge>
        )
    })

    return <Stack>{fileChips}</Stack>
}
