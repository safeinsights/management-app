'use client'

import { ProposalRequest } from '@/components/study/proposal-initial-request'
import { Box, Stack, Text } from '@mantine/core'
import type { StudyForReview } from './review-types'

type ProposalSectionProps = {
    study: StudyForReview
    orgSlug: string
    initialExpanded?: boolean
}

const EVALUATION_CRITERIA = [
    {
        label: 'Feasibility',
        description: 'Can this study be supported with your available data and infrastructure?',
    },
    {
        label: 'Impact',
        description: 'Could the results advance the understanding of teaching and learning?',
    },
    {
        label: 'Researcher background',
        description:
            'Does the researcher have relevant expertise? If a student or post-doc, do they have appropriate faculty or PI supervision?',
    },
]

function CriteriaList() {
    return (
        <Stack gap={4} data-testid="evaluation-criteria">
            {EVALUATION_CRITERIA.map(({ label, description }) => (
                <Text size="sm" key={label}>
                    <strong>{label}:</strong> {description}
                </Text>
            ))}
        </Stack>
    )
}

function StatusBanner({ labName }: { labName: string }) {
    return (
        <Box
            bg="purple.0"
            p="md"
            mb="md"
            style={{ borderRadius: 'var(--mantine-radius-sm)' }}
            data-testid="status-banner"
        >
            <Stack gap="xs">
                <Text size="sm">
                    <strong>{labName}</strong> has submitted an initial request requesting permission to use your data.
                    Please review it and share your feedback and decision. Consider evaluating the initial request on
                    these criteria:
                </Text>
                <CriteriaList />
            </Stack>
        </Box>
    )
}

export function ProposalSection({ study, orgSlug, initialExpanded = true }: ProposalSectionProps) {
    const labName = study.submittingLabName ?? study.submittedByOrgSlug

    return (
        <ProposalRequest
            study={study}
            orgSlug={orgSlug}
            stepLabel="STEP 1"
            heading="Review initial request"
            banner={<StatusBanner labName={labName} />}
            initialExpanded={initialExpanded}
        />
    )
}
