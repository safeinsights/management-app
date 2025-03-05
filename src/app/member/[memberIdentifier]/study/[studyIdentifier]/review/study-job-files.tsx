'use client'

import React, { FC } from 'react'
import { Badge, Group, Text } from '@mantine/core'
import { dataForJobAction } from '@/app/member/[memberIdentifier]/study/[studyIdentifier]/job/[studyJobIdentifier]/review/actions'
import { uuidToB64 } from '@/lib/uuid'
import { useQuery } from '@tanstack/react-query'
import { Download } from '@phosphor-icons/react/dist/ssr'

export const StudyJobFiles: FC<{ jobId: string }> = ({ jobId }) => {
    const { data } = useQuery({
        queryKey: ['studyJobFiles', jobId],
        queryFn: () => dataForJobAction(uuidToB64(jobId)),
    })

    if (!jobId) {
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
                href="TODO Download"
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
