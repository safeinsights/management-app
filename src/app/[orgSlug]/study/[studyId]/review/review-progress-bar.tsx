import { Paper, Skeleton, Text } from '@mantine/core'
import type { StepDef } from './review-types'

type ReviewProgressBarProps = {
    currentStep: number
    steps: StepDef[]
}

export function ReviewProgressBar({ currentStep, steps }: ReviewProgressBarProps) {
    return (
        <Paper p="xl" data-testid="review-progress-bar">
            <Text fw={600} mb="sm">
                Review progress — Step {currentStep + 1} of {steps.length}
            </Text>
            <Skeleton height={8} radius="xl" />
        </Paper>
    )
}
