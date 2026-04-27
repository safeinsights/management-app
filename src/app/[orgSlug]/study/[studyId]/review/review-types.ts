import type { SelectedStudy } from '@/server/actions/study.actions'
import type { Decision } from '@/lib/proposal-review'

export type StudyForReview = SelectedStudy

export type DecisionOption = {
    value: Decision
    label: string
    description: string
    warning?: string
    disabled?: boolean
}

export const DECISION_OPTIONS: DecisionOption[] = [
    {
        value: 'approve',
        label: 'Approve',
        description: 'Approve this initial request and share your feedback.',
    },
    {
        value: 'needs-clarification',
        label: 'Needs clarification',
        description:
            'Request clarifications or specific revisions to this initial request. The researcher will be able to view your feedback and may choose to revise and resubmit.',
    },
    {
        value: 'reject',
        label: 'Reject',
        description: 'Reject this initial request and share your reasoning with the researcher.',
        warning:
            'This is intended as a last resort due to major, unresolvable issues and will end this study. This action cannot be undone.',
    },
]
