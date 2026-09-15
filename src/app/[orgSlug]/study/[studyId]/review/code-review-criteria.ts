import { type CodeReviewCriteriaKey } from '@/hooks/use-code-review-evaluation-map'
import { legalDocumentCollectionLabels } from '@/schema/legal-document'

export type CodeReviewCriterion = {
    key: CodeReviewCriteriaKey
    label: string
    /** Rendered beside the label when the criterion needs qualifying for this study. */
    note?: string
}

const TEST_STUDY_AGREEMENT_NOTE = `This is a test study. Therefore ${legalDocumentCollectionLabels.SLA} do not exist for this study.`

// Resolved here rather than drilled as a flag: the rows already know their own conditions.
export const codeReviewCriteria = ({ isTestStudy }: { isTestStudy: boolean }): readonly CodeReviewCriterion[] => [
    { key: 'proposalAlignment', label: 'Code aligns with approved research proposal' },
    {
        key: 'agreementCompliance',
        label: 'Code aligns with all the agreements',
        note: isTestStudy ? TEST_STUDY_AGREEMENT_NOTE : undefined,
    },
    { key: 'securityChecks', label: 'Security and vulnerability checks passed' },
    { key: 'privacyProtection', label: 'No risk of PII exposure expected in outputs' },
]
