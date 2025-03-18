'use client'

import React, { FC } from 'react'
import { Badge, Group, Text } from '@mantine/core'
import { dataForJobAction } from '@/app/member/[memberIdentifier]/study/[studyIdentifier]/job/[studyJobIdentifier]/review/actions'
import { useQuery } from '@tanstack/react-query'
import { Download } from '@phosphor-icons/react/dist/ssr'
import { StudyJob } from '@/schema/study'

export const StudyJobFiles: FC<{ job: StudyJob }> = ({ job }) => {
    const { data, isLoading } = useQuery({
        queryKey: ['studyJobFiles', job.id],
        queryFn: () => dataForJobAction(job.id),
    })

    if (isLoading) return null

    if (!data) {
        return <Text>No files!</Text>
    }

    // TODO figure out download endpoint
    const fileNames = Object.keys(data?.manifest.files || {})

    const fileChips = fileNames.map((fileName) => {
        return (
            <Badge
                color="#D4D1F3"
                c="black"
                component="a"
                href={`analysis/${data.jobInfo?.memberIdentifier}/${data.jobInfo?.studyId}/${data.jobInfo?.studyJobId}/code`}
                target="_blank"
                rightSection={<Download />}
                style={{ cursor: 'pointer' }}
                key={fileName}
            >
                {fileName}
            </Badge>
        )
    })

    return <Group>{fileChips}</Group>
}
