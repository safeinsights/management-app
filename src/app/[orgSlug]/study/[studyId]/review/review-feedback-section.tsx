'use client'

import { Divider, Group, List, Paper, Stack, Text } from '@mantine/core'
import type { useReviewFeedback } from '@/hooks/use-review-feedback'
import { RequiredIndicator } from '@/components/required-indicator'
import { DecisionFeedbackEditor } from './decision-feedback-editor'
import { reviewFeedbackDocNameForVersion } from '@/lib/collaboration-documents'
import { usePublishReviewFeedbackProvider } from '@/lib/realtime/review-feedback-provider-context'

const EDITOR_SKELETON_HEIGHT = 600

const contentStyle = {
    minHeight: 600,
    padding: '8px 16px',
    outline: 'none',
    fontSize: '1rem',
    lineHeight: 1.6,
} as const

type ReviewFeedbackSectionProps = {
    feedback: ReturnType<typeof useReviewFeedback>
    submittingLabName: string
    studyId: string
    reviewVersion: number
}

const PLACEHOLDER_TEXT = `For e.g., "This study is feasible with our current data. We can provide the requested variables for the specified time period. Question: Will you need student demographic data beyond what is listed?"`

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
            <Text component="span" fz={16} c="charcoal.9">
                <Text component="span" fz={16} fw={600}>
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
            placeholder={PLACEHOLDER_TEXT}
            contentStyle={contentStyle}
            skeletonHeight={EDITOR_SKELETON_HEIGHT}
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
        <Paper p="xxl" data-testid="review-feedback-section">
            <Stack gap="lg">
                <Group gap={4} align="center">
                    <Text fz={20} fw={700} c="charcoal.9">
                        {SECTION_TITLE}
                    </Text>
                    <RequiredIndicator fz={20} fw={700} />
                </Group>
                <Divider />
                <Stack gap="md">
                    <Text fz={16} c="charcoal.9">
                        Share your decision and feedback on this proposal with {submittingLabName}. Consider evaluating
                        the proposal on these criteria:
                    </Text>
                    <List spacing={4} fz={16} data-testid="evaluation-criteria">
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
        </Paper>
    )
}
