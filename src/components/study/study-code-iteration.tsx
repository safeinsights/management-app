'use client'

import React, { FC } from 'react'
import { Badge, Stack, Text, Group } from '@mantine/core'
import { loadStudyJobAction } from '@/server/actions/study-job.actions'
import { StudyJob } from '@/schema/study'
import { useQuery } from '@tanstack/react-query'
import { DownloadIcon } from '@phosphor-icons/react/dist/ssr'
import { studyCodeURL } from '@/lib/paths'

export const StudyCodeIteration: FC<{ job: StudyJob }> = ({ job }) => {
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

    const mainCodeFile = data.files.find((file) => file.fileType === 'MAIN-CODE')
    const supplementalCodeFiles = data.files.filter((file) => file.fileType === 'SUPPLEMENTAL-CODE')

    const mainCodeFileChip = mainCodeFile ? (
        <Badge
            color="#D4D1F3"
            c="black"
            component="a"
            href={studyCodeURL(job.id, mainCodeFile.name)}
            target="_blank"
            rightSection={<DownloadIcon />}
            style={{ cursor: 'pointer' }}
            key={mainCodeFile.name}
        >
            {mainCodeFile.name}
        </Badge>
    ) : null

    const supplementalCodeFileChips = supplementalCodeFiles.map((file) => (
        <Badge
            color="#D4D1F3"
            c="black"
            component="a"
            href={studyCodeURL(job.id, file.name)}
            target="_blank"
            rightSection={<DownloadIcon />}
            style={{ cursor: 'pointer' }}
            key={file.name}
        >
            {file.name}
        </Badge>
    ))

    return (
        <Stack>
            <Text>View the code files that you uploaded to run against the dataset.</Text>
            {mainCodeFileChip && (
                <Group>
                    <Text fw={650}>Main code file:</Text>
                    {mainCodeFileChip}
                </Group>
            )}
            {supplementalCodeFiles.length > 0 && (
                <Group>
                    <Text fw={650}>Additional file(s):</Text>
                    <Group gap="md">{supplementalCodeFileChips}</Group>
                </Group>
            )}
        </Stack>
    )
}
