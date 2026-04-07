import { Paper, Skeleton, Text } from '@mantine/core'
import type { StudyForReview } from './review-types'

type ProposalSectionProps = {
    study: StudyForReview
}

export function ProposalSection({ study }: ProposalSectionProps) {
    return (
        <Paper p="xl" data-testid="proposal-section">
            <Text fw={600} mb="sm">
                Proposal — {study.title}
            </Text>
            <Skeleton height={120} radius="md" />
        </Paper>
    )
}
