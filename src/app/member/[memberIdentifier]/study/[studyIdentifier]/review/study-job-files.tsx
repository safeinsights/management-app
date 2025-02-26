'use client'

import React, { FC } from 'react'
import { Group, Pill, Text } from '@mantine/core'
import { dataForJobAction } from '@/app/member/[memberIdentifier]/study/[studyIdentifier]/job/[studyJobIdentifier]/review/actions'
import { uuidToB64 } from '@/lib/uuid'
import { useQuery } from '@tanstack/react-query'
import { Download } from '@phosphor-icons/react/dist/ssr'

export const StudyJobFiles: FC<{ jobId: string }> = ({ jobId }) => {
    const { data, isPending } = useQuery({
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
            <Pill style={{ cursor: 'pointer' }} key={fileName} onClick={() => console.log('Download me!')}>
                <Group>
                    {fileName}
                    <Download />
                </Group>
            </Pill>
        )
    })

    return <Text>{fileChips}</Text>
}
