'use client'

import { useState } from 'react'
import { Button, Divider, Stack, Text } from '@mantine/core'
import { usePopover } from '@/hooks/use-popover'
import { AppModal } from '@/components/modal'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { DatasetsField, LexicalProposalField, PIField, ResearcherField } from '@/components/study/proposal-fields'
import { stringifyJson } from '@/lib/string'

type SubmittedProposalPreviewProps = {
    study: SelectedStudy
    orgSlug: string
}

export function SubmittedProposalPreview({ study, orgSlug }: SubmittedProposalPreviewProps) {
    const [isOpen, setIsOpen] = useState(false)
    const { getPopoverProps } = usePopover()

    return (
        <>
            <Button variant="outline" mt="md" size="md" onClick={() => setIsOpen(true)}>
                View submitted study proposal
            </Button>
            <AppModal size="xl" isOpen={isOpen} onClose={() => setIsOpen(false)} title="View as reviewer">
                <Stack gap="md">
                    <Stack gap={4}>
                        <Text fw={600} size="sm">
                            Study title
                        </Text>
                        <Text size="sm">{study.title}</Text>
                    </Stack>

                    <DatasetsField datasets={study.datasets ?? []} orgDataSources={study.orgDataSources} />

                    <Divider />

                    <LexicalProposalField
                        label="Research question(s)"
                        value={stringifyJson(study.researchQuestions)}
                        divider="none"
                    />
                    <LexicalProposalField
                        label="Project summary"
                        value={stringifyJson(study.projectSummary)}
                        divider="none"
                    />
                    <LexicalProposalField label="Impact" value={stringifyJson(study.impact)} divider="none" />
                    <LexicalProposalField
                        label="Additional notes or requests"
                        value={stringifyJson(study.additionalNotes)}
                        divider="none"
                    />

                    <PIField study={study} orgSlug={orgSlug} {...getPopoverProps('pi')} />
                    <ResearcherField study={study} orgSlug={orgSlug} {...getPopoverProps('researcher')} mt="md" />
                </Stack>
            </AppModal>
        </>
    )
}
