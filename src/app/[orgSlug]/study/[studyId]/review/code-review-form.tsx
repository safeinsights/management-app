'use client'

import { Link } from '@/components/links'
import { useCodeReviewDecision } from '@/hooks/use-code-review-decision'
import { useCodeReviewFeedback } from '@/hooks/use-code-review-feedback'
import { Routes } from '@/lib/routes'
import { Button, Group, Paper, Stack } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { CodeReviewDecisionSection } from './code-review-decision-section'
import { CodeReviewFeedbackSection } from './code-review-feedback-section'

type CodeReviewFormProps = {
    labName: string
    orgSlug: string
    studyId: string
}

export function CodeReviewForm({ labName, orgSlug, studyId }: CodeReviewFormProps) {
    const feedback = useCodeReviewFeedback()
    const decision = useCodeReviewDecision()

    const canSubmit = feedback.value.trim().length > 0 && !feedback.isOverLimit && decision.selected !== null

    const handleSubmit = () => {
        // TODO(future card): wire up server action to persist the decision + feedback
        // and transition the job status. For now this is a UI-only stub.
        // eslint-disable-next-line no-console
        console.log('Submit code review:', { decision: decision.selected, feedback: feedback.value })
    }

    return (
        <Stack gap="xl">
            <Paper p="xl">
                <Stack gap="md">
                    <CodeReviewFeedbackSection feedback={feedback} labName={labName} studyId={studyId} />
                    <CodeReviewDecisionSection decision={decision} labName={labName} />
                </Stack>
            </Paper>
            <Group justify="space-between">
                <Link
                    href={Routes.orgDashboard({ orgSlug })}
                    c="purple.5"
                    td="none"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    data-testid="code-review-back-link"
                >
                    <CaretLeftIcon size={16} weight="bold" />
                    Back
                </Link>
                <Button disabled={!canSubmit} onClick={handleSubmit} data-testid="code-review-submit-button">
                    Submit review
                </Button>
            </Group>
        </Stack>
    )
}
