'use client'

import { useState } from 'react'
import { Button, Divider, Stack, Text } from '@mantine/core'
import { AppModal } from '@/components/modal'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { LexicalProposalField, PIField, ResearcherField, stringifyJson } from '../review/proposal-review-view'

type SubmittedProposalPreviewProps = {
    study: SelectedStudy
    orgSlug: string
}

export function SubmittedProposalPreview({ study }: SubmittedProposalPreviewProps) {
    const [isOpen, setIsOpen] = useState(false)

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

                    {study.datasets && study.datasets.length > 0 && (
                        <Stack gap={4}>
                            <Text fw={600} size="sm">
                                Dataset(s) of interest
                            </Text>
                            <Text size="sm">{study.datasets.join(', ')}</Text>
                        </Stack>
                    )}

                    <Divider />

                    <LexicalProposalField
                        label="Research question(s)"
                        value={stringifyJson(study.researchQuestions)}
                        showDivider={false}
                    />
                    <LexicalProposalField
                        label="Project summary"
                        value={stringifyJson(study.projectSummary)}
                        showDivider={false}
                    />
                    <LexicalProposalField label="Impact" value={stringifyJson(study.impact)} showDivider={false} />
                    <LexicalProposalField
                        label="Additional notes or requests"
                        value={stringifyJson(study.additionalNotes)}
                        showDivider={false}
                    />

                    <PIField study={study} />
                    <ResearcherField study={study} orgSlug={study.submittedByOrgSlug} mt="md" />
                </Stack>
            </AppModal>
        </>
    )
}
