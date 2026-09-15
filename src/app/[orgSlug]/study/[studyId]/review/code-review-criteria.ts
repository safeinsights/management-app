import { type CodeReviewCriteriaKey } from '@/hooks/use-code-review-evaluation-map'
import { legalDocumentCollectionLabels } from '@/schema/legal-document'

export type CodeReviewCriterion = {
    key: CodeReviewCriteriaKey
    label: string
    /** Shown beside the label only while the study is a test study. */
    testStudyNote?: string
}

export const CODE_REVIEW_CRITERIA: readonly CodeReviewCriterion[] = [
    { key: 'proposalAlignment', label: 'Code aligns with approved research proposal' },
    {
        key: 'agreementCompliance',
        label: 'Code aligns with all the agreements',
        testStudyNote: `This is a test study. Therefore ${legalDocumentCollectionLabels.SLA} do not exist for this study.`,
    },
    { key: 'securityChecks', label: 'Security and vulnerability checks passed' },
    { key: 'privacyProtection', label: 'No risk of PII exposure expected in outputs' },
]
