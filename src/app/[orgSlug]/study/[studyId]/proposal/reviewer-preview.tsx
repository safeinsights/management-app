'use client'

import { FC } from 'react'
import { Box, Divider, Stack, Text } from '@mantine/core'
import { EditableText } from '@/components/editable-text'
import { useProposal } from '@/contexts/proposal'
import { editableTextFields } from './field-config'

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

            {editableTextFields.map((field) => (
                <Box key={field.id}>
                    <Text size="sm" fw={600} mb="xs">
                        {field.label}
                    </Text>
                    {values[field.id] ? (
                        <EditableText value={values[field.id] as string} readOnly borderless resizable={false} />
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
