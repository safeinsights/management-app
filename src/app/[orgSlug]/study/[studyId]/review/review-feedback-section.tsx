'use client'

import { Divider, Group, List, Stack, Text } from '@mantine/core'
import type { useReviewFeedback } from '@/hooks/use-review-feedback'
import { RequiredIndicator } from '@/components/required-indicator'
import { DecisionFeedbackEditor } from './decision-feedback-editor'
import { reviewFeedbackDocNameForVersion } from '@/lib/collaboration-documents'
import { usePublishReviewFeedbackProvider } from '@/lib/realtime/review-feedback-provider-context'
import { fontWeight, semanticColor } from '@/theme/tokens'

type ReviewFeedbackSectionProps = {
    feedback: ReturnType<typeof useReviewFeedback>
    submittingLabName: string
    studyId: string
    reviewVersion: number
}

const SECTION_TITLE = 'Decision'

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
            'Does the researcher have relevant expertise, or appropriate faculty/PI supervision if they are a student or post-doc?',
    },
] as const

function CriterionLine({ label, description }: { label: string; description: string }) {
    return (
        <List.Item>
            <Text component="span" fz="md" c={semanticColor('text.primary')}>
                <Text component="span" fz="md" fw={fontWeight.semibold}>
                    {label}:
                </Text>{' '}
                {description}
            </Text>
        </List.Item>
    )
}

function FeedbackEditor({
    feedback,
    studyId,
    reviewVersion,
}: {
    feedback: ReturnType<typeof useReviewFeedback>
    studyId: string
    reviewVersion: number
}) {
    const publishProvider = usePublishReviewFeedbackProvider()
    return (
        <DecisionFeedbackEditor
            feedback={feedback}
            studyId={studyId}
            docName={reviewFeedbackDocNameForVersion(studyId, reviewVersion)}
            inputId="review-feedback"
            ariaLabel="Initial request review feedback"
            contentHeight={600}
            fz="md"
            isResizable
            onProviderReady={publishProvider}
        />
    )
}

export function ReviewFeedbackSection({
    feedback,
    submittingLabName,
    studyId,
    reviewVersion,
}: ReviewFeedbackSectionProps) {
    return (
        <Stack gap="lg" data-testid="review-feedback-section">
            <Group gap="xxs" align="center">
                <Text fz="xl" fw={fontWeight.bold} c={semanticColor('text.primary')}>
                    {SECTION_TITLE}
                </Text>
                <RequiredIndicator fz="xl" fw={fontWeight.bold} />
            </Group>
            <Divider />
            <Stack gap="md">
                <Text fz="md" c={semanticColor('text.primary')}>
                    Share your decision and feedback on this proposal with {submittingLabName}. Consider evaluating the
                    proposal on these criteria:
                </Text>
                <List spacing="xxs" fz="md" data-testid="evaluation-criteria">
                    {EVALUATION_CRITERIA.map((criterion) => (
                        <CriterionLine
                            key={criterion.label}
                            label={criterion.label}
                            description={criterion.description}
                        />
                    ))}
                </List>
                <FeedbackEditor feedback={feedback} studyId={studyId} reviewVersion={reviewVersion} />
            </Stack>
        </Stack>
    )
}
