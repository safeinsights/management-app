'use client'

import { FC } from 'react'
import { Box, Divider, Stack, Text } from '@mantine/core'
import { EditableText } from '@/components/editable-text'
import { useProposal } from '@/contexts/proposal'

interface ReviewSection {
    label: string
    id: 'researchQuestions' | 'projectSummary' | 'impact' | 'additionalNotes'
}

const sections: ReviewSection[] = [
    { label: 'Research questions', id: 'researchQuestions' },
    { label: 'Project summary', id: 'projectSummary' },
    { label: 'Impact', id: 'impact' },
    { label: 'Additional notes', id: 'additionalNotes' },
]

interface ReviewerPreviewProps {
    researcherName: string
}

export const ReviewerPreview: FC<ReviewerPreviewProps> = ({ researcherName }) => {
    const { form } = useProposal()
    const values = form.getValues()

    return (
        <Stack gap="lg">
            <Box>
                <Text size="sm" fw={600}>
                    Study title
                </Text>
                <Text size="md" fw={400}>
                    {values.title || 'Untitled Draft'}
                </Text>
            </Box>

            <Box>
                <Text size="sm" fw={600}>
                    Dataset(s) of interest
                </Text>
                <Text size="md" fw={400}>
                    {values.datasets.length > 0 ? values.datasets.join(', ') : 'None selected'}
                </Text>
            </Box>

            <Divider />

            {sections.map((section) => (
                <Box key={section.id}>
                    <Text size="sm" fw={600} mb="xs">
                        {section.label}
                    </Text>
                    {values[section.id] ? (
                        <EditableText value={values[section.id] as string} readOnly borderless resizable={false} />
                    ) : (
                        <Text size="md" fw={400} fs="italic">
                            Not provided
                        </Text>
                    )}
                </Box>
            ))}

            <Divider />

            <Box>
                <Text size="sm" fw={600}>
                    Principal Investigator
                </Text>
                <Text size="md" fw={400}>
                    {values.piName || 'Not selected'}
                </Text>
            </Box>

            <Box>
                <Text size="sm" fw={600}>
                    Researcher
                </Text>
                <Text size="md" fw={400}>
                    {researcherName}
                </Text>
            </Box>
        </Stack>
    )
}
