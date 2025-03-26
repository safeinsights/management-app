'use client'

import React, { FC } from 'react'
import { Badge, Stack, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Download } from '@phosphor-icons/react/dist/ssr'
import { dataForStudyDocumentsAction } from '@/server/actions/study-job.actions'

export const StudyDocuments: FC<{ studyId: string }> = ({ studyId }) => {
    const { data, isLoading } = useQuery({
        queryKey: ['studyDocuments', studyId],
        queryFn: () => dataForStudyDocumentsAction(studyId),
    })

    if (isLoading) return null

    if (!data || data.documents.length === 0) {
        return <Text>No documents found!</Text>
    }

    const documentChips = data.documents.map((doc) => (
        <Badge
            key={doc.path}
            color="#D4D1F3"
            c="black"
            component="a"
            href={`/dl/study/${data.studyInfo.memberIdentifier}/${studyId}/docs/${doc.path}`}
            target="_blank"
            rightSection={<Download />}
            style={{ cursor: 'pointer' }}
        >
            {doc.name}
        </Badge>
    ))

    return <Stack>{documentChips}</Stack>
}
