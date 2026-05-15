import type { CodeDecision } from '@/lib/code-review'

export type CodeDecisionOption = {
    value: CodeDecision
    label: string
    description: string
    warning?: string
}

export const CODE_DECISION_OPTIONS: CodeDecisionOption[] = [
    {
        value: 'approve',
        label: 'Approve and run code',
        description:
            'The code will proceed to run in your secure enclave. {researchLab} will be notified via email when the code is approved and is being run.',
    },
    {
        value: 'request-revision',
        label: 'Request revision',
        description:
            'Return this code submission to {researchLab} for necessary updates, additional information, or specific changes.',
    },
    {
        value: 'reject',
        label: 'Reject and end study',
        description:
            'Permanently end this study due to major, unresolvable issues. Share rationale with {researchLab}.',
        warning: 'Warning: This terminates the study and cannot be undone.',
    },
]
