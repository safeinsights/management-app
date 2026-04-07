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
