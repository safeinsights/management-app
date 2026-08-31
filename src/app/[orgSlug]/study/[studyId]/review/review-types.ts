import type { SelectedStudy } from '@/server/actions/study.actions'
import type { Decision } from '@/lib/review-decision'
import type { Submitted } from '@/schema/study'

// Review flows always operate on a submitted study (status != DRAFT), so the
// title is guaranteed non-null by the DB CHECK constraint. Route entry points
// must narrow with isSubmittedStudy() before rendering review components.
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
