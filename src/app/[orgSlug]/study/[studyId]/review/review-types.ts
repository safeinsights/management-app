import type { SelectedStudy } from '@/server/actions/study.actions'

export type Decision = 'approve' | 'needs-clarification' | 'reject'

export type StepDef = { label: string; description: string }

export type StudyForReview = SelectedStudy

export const REVIEW_STEPS: StepDef[] = [
    { label: 'Review proposal', description: 'Review the study proposal details' },
    { label: 'Provide feedback', description: 'Share your feedback on the proposal' },
    { label: 'Make decision', description: 'Approve, reject, or request clarification' },
    { label: 'Review agreements', description: 'Review data use agreements' },
    { label: 'Submit review', description: 'Submit your final review' },
]

export const FEEDBACK_MIN_WORDS = 50
export const FEEDBACK_MAX_WORDS = 500

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
