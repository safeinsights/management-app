'use client'

import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { useReviewDecision } from '@/hooks/use-review-decision'
import { useReviewFeedback } from '@/hooks/use-review-feedback'
import { Routes } from '@/lib/routes'
import { Box, Button, Group, Stack, Title } from '@mantine/core'
import { useRouter } from 'next/navigation'
import { ProposalSection } from './proposal-section'
import { ReviewDecisionSection } from './review-decision-section'
import { ReviewFeedbackSection } from './review-feedback-section'
import { ReviewProgressBar } from './review-progress-bar'
import { REVIEW_STEPS, type StudyForReview } from './review-types'

type NewProposalReviewViewProps = {
    orgSlug: string
    study: StudyForReview
}

function useNewProposalReview({ orgSlug }: { orgSlug: string }) {
    const feedback = useReviewFeedback()
    const decision = useReviewDecision()
    const router = useRouter()

    const canSubmit = feedback.isValid && decision.selected !== null

    const handleBack = () => {
        router.push(Routes.orgDashboard({ orgSlug }))
    }

    const handleSubmit = () => {
        // Will be implemented in a future ticket
    }

    return { feedback, decision, canSubmit, handleBack, handleSubmit }
}

export function NewProposalReviewView({ orgSlug, study }: NewProposalReviewViewProps) {
    const { feedback, decision, canSubmit, handleBack, handleSubmit } = useNewProposalReview({ orgSlug })

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xl" py="xl">
                <PageBreadcrumbs
                    crumbs={[
                        ['Dashboard', Routes.orgDashboard({ orgSlug })],
                        ['Study proposal', Routes.studyReview({ orgSlug, studyId: study.id })],
                        ['Review initial request'],
                    ]}
                />

                <Title order={1} fz={40} fw={700}>
                    Study proposal
                </Title>

                <ReviewProgressBar currentStep={0} steps={REVIEW_STEPS} />
                <ProposalSection study={study} orgSlug={orgSlug} />
                <ReviewFeedbackSection feedback={feedback} />
                <ReviewDecisionSection decision={decision} />

                <Group justify="space-between">
                    <Button variant="outline" onClick={handleBack}>
                        Back
                    </Button>
                    <Button disabled={!canSubmit} onClick={handleSubmit}>
                        Submit review
                    </Button>
                </Group>
            </Stack>
        </Box>
    )
}
