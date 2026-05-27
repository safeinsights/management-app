import { type CodeReviewCriteriaKey } from '@/hooks/use-code-review-evaluation-map'

export type CodeReviewCriterion = {
    key: CodeReviewCriteriaKey
    label: string
}

export const CODE_REVIEW_CRITERIA: readonly CodeReviewCriterion[] = [
    { key: 'proposalAlignment', label: 'Code aligns with approved research proposal' },
    { key: 'agreementCompliance', label: 'Code aligns with all the agreements' },
    { key: 'securityChecks', label: 'Security and vulnerability checks passed' },
    { key: 'privacyProtection', label: 'No risk of PII exposure expected in outputs' },
]

export const CODE_REVIEW_BANNER_CRITERIA: readonly { label: string; description: string }[] = [
    { label: 'Proposal alignment', description: 'Does the code align with the approved research proposal?' },
    { label: 'Agreement compliance', description: 'Does the code comply with all the agreements?' },
    { label: 'Security checks', description: 'Have security and vulnerability checks been passed?' },
    { label: 'Privacy protection', description: 'Is there any risk of PII exposure expected in the outputs?' },
]
