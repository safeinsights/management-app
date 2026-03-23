'use client'

import { FC, useState } from 'react'
import { Box, Divider, Stack, Text } from '@mantine/core'
import { useParams } from 'next/navigation'
import { EditableText } from '@/components/editable-text'
import { ResearcherProfilePopover } from '@/components/researcher-profile-popover'
import { extractTextFromLexical } from '@/lib/word-count'
import { useProposal } from '@/contexts/proposal'
import { useOrgDataSources } from '@/hooks/use-org-data-sources'
import { DEFAULT_DRAFT_TITLE } from './schema'
import { editableTextFields } from './field-config'

interface ReviewerPreviewProps {
    researcherName: string
    researcherId: string
    piUserId: string
    enclaveOrgSlug?: string
}

export const ReviewerPreview: FC<ReviewerPreviewProps> = ({
    researcherName,
    researcherId,
    piUserId,
    enclaveOrgSlug,
}) => {
    const { form, studyId } = useProposal()
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const { options: datasetOptions } = useOrgDataSources(enclaveOrgSlug)
    const values = form.getValues()
    const [activePopover, setActivePopover] = useState<string | null>(null)

    const handleOpenChange = (id: string) => (open: boolean) =>
        // handle the opening and closing of multiple popovers
        setActivePopover((current) => {
            if (open) return id // opening this popover, make it active
            if (current === id) return null // closing the currently active popover
            return current // a different popover is active, leave it unchanged
        })

    return (
        <Stack gap="lg">
            <Box>
                <Text size="sm" fw={600} mb="xs">
                    Study title
                </Text>
                <Text size="md" fw={400}>
                    {values.title || DEFAULT_DRAFT_TITLE}
                </Text>
            </Box>

            <Box>
                <Text size="sm" fw={600} mb="xs">
                    Dataset(s) of interest
                </Text>
                <Text size="md" fw={400}>
                    {values.datasets.length > 0
                        ? values.datasets
                              .map((id) => datasetOptions.find((o) => o.value === id)?.label || id)
                              .join(', ')
                        : 'None selected'}
                </Text>
            </Box>

            <Divider />

            {editableTextFields.map((field) => {
                const fieldValue = values[field.id] as string
                const hasContent = extractTextFromLexical(fieldValue).trim().length > 0

                return (
                    <Box key={field.id}>
                        <Text size="sm" fw={600} mb="xs">
                            {field.label}
                        </Text>
                        {hasContent ? (
                            <EditableText value={fieldValue} readOnly borderless resizable={false} />
                        ) : (
                            <Text size="md" fw={400}>
                                Not provided
                            </Text>
                        )}
                    </Box>
                )
            })}

            <Divider />

            <Box>
                <Text size="sm" fw={600} mb="xs">
                    Principal Investigator
                </Text>
                {piUserId ? (
                    <ResearcherProfilePopover
                        userId={piUserId}
                        studyId={studyId}
                        orgSlug={orgSlug}
                        name={values.piName}
                        position="right-start"
                        opened={activePopover === 'pi'}
                        onOpenChange={handleOpenChange('pi')}
                    />
                ) : (
                    <Text size="md">Not selected</Text>
                )}
            </Box>

            <Box>
                <Text size="sm" fw={600} mb="xs">
                    Researcher
                </Text>
                <ResearcherProfilePopover
                    userId={researcherId}
                    studyId={studyId}
                    orgSlug={orgSlug}
                    name={researcherName}
                    position="right-start"
                    opened={activePopover === 'researcher'}
                    onOpenChange={handleOpenChange('researcher')}
                />
            </Box>
        </Stack>
    )
}
