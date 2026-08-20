'use client'

import { FC } from 'react'
import { Box, Divider, Stack, Text } from '@mantine/core'
import { useParams } from 'next/navigation'
import { EditableText } from '@/components/editable-text'
import { ResearcherProfilePopover } from '@/components/researcher-profile-popover'
import { extractTextFromLexical } from '@/lib/lexical'
import { useOrgDataSources } from '@/hooks/use-org-data-sources'
import { usePopover } from '@/hooks/use-popover'
import { type ProposalFormValues } from './schema'
import { editableTextFields } from './field-config'

interface ReviewerPreviewProps {
    studyId: string
    /**
     * Where the title comes from is the caller's call, because the two callers disagree
     * (OTTER-690). On a DRAFT the title is owned by Step 1 and `values.title` is a stale copy,
     * so the proposal footer passes the persisted `study.title`. On the resubmit page the title
     * genuinely is edited live on the page, so that footer passes `form.values.title`.
     */
    studyTitle: string | null | undefined
    values: ProposalFormValues
    researcherName: string
    researcherId: string
    enclaveOrgSlug?: string
}

// Pure presentation — accepts form values + studyId as props so it can be
// rendered from any context (ProposalProvider, EditResubmitProvider, ...).
export const ReviewerPreview: FC<ReviewerPreviewProps> = ({
    studyId,
    studyTitle,
    values,
    researcherName,
    researcherId,
    enclaveOrgSlug,
}) => {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const { options: datasetOptions } = useOrgDataSources(enclaveOrgSlug)
    const { getPopoverProps } = usePopover()

    return (
        <Stack gap="lg">
            <Box>
                <Text size="sm" fw={600} mb="xs">
                    Study title
                </Text>
                <Text size="md" fw={400}>
                    {studyTitle?.trim() || 'Not provided'}
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
                {values.piUserId ? (
                    <ResearcherProfilePopover
                        userId={values.piUserId}
                        studyId={studyId}
                        orgSlug={orgSlug}
                        name={values.piName}
                        position="right-start"
                        {...getPopoverProps('pi')}
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
                    {...getPopoverProps('researcher')}
                />
            </Box>
        </Stack>
    )
}
