import { FC } from 'react'
import { Stack, Text } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { FeedbackEntries } from '@/components/study/feedback-and-notes'
import type { Json } from '@/database/types'
import { toOutputsFeedbackEntry } from '@/lib/outputs-review'
import { fontWeight, semanticColor } from '@/theme/tokens'

export type CodeRunFeedbackRow = {
    id: string
    body: Json
    createdAt: Date | string
    round: number | null
    authorName: string
}

type CodeRunFeedbackProps = {
    feedback: CodeRunFeedbackRow[]
    /** Shows a notice in place of the feedback, so a failed query never reads as "no feedback". */
    loadError?: boolean
    testId?: string
}

// One run's outputs feedback. It always renders, so "no feedback" never reads as a failure to load
// it; older rejections recorded the decision without a comment.
export const CodeRunFeedback: FC<CodeRunFeedbackProps> = ({
    feedback,
    loadError = false,
    testId = 'code-run-feedback',
}) => {
    if (loadError) return <AlertNotFound title="Feedback could not be loaded" message="Please refresh and try again" />

    if (feedback.length > 0) {
        return <FeedbackEntries entries={feedback.map(toOutputsFeedbackEntry)} alwaysExpandLatest testId={testId} />
    }

    return (
        <Stack gap="sm" data-testid={testId}>
            <Text fw={fontWeight.bold} fz="sm">
                Reviewer feedback
            </Text>
            <Text fz="sm" c={semanticColor('text.secondary')}>
                No feedback was shared for this run.
            </Text>
        </Stack>
    )
}
