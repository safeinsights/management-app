import type { SelectedStudy } from '@/server/actions/study.actions'
import type { Decision } from '@/lib/review-decision'
import type { Submitted } from '@/schema/study'

// A submitted study's title is non-null by DB CHECK constraint, so route entry points must narrow
// with isSubmittedStudy() first.
export type StudyForReview = Submitted<SelectedStudy>

export type DecisionOption = {
    value: Decision
    label: string
    description: string
}

export const buildDecisionOptions = (labName: string): DecisionOption[] => [
    {
        value: 'approve',
        label: 'Approve',
        description: 'Approve the proposal to begin the code submission phase.',
    },
    {
        value: 'needs-clarification',
        label: 'Request revision',
        description: `Send the proposal back to ${labName} for changes or additional information.`,
    },
    {
        value: 'reject',
        label: 'Decline and end study',
        description:
            'Permanently close this study. Use only for major issues that cannot be resolved. This action cannot be undone.',
    },
]
