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
