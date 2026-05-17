import { type CodeReviewCriteriaKey } from '@/hooks/use-code-review-evaluation-map'

export type CodeReviewCriterion = {
    key: CodeReviewCriteriaKey
    label: string
    description: string
}

export const CODE_REVIEW_CRITERIA: readonly CodeReviewCriterion[] = [
    {
        key: 'proposalAlignment',
        label: 'Proposal alignment',
        description: 'Does the code align with the approved research proposal?',
    },
    {
        key: 'agreementCompliance',
        label: 'Agreement compliance',
        description: 'Does the code comply with all the agreements?',
    },
    {
        key: 'securityChecks',
        label: 'Security checks',
        description: 'Have security and vulnerability checks been passed?',
    },
    {
        key: 'privacyProtection',
        label: 'Privacy protection',
        description: 'Is there any risk of PII exposure expected in the outputs?',
    },
]
