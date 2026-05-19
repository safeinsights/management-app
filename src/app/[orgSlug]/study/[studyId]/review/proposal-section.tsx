'use client'

import { ProposalRequest } from '@/components/study/proposal-initial-request'
import { ReviewCriteriaBanner } from '@/components/study/review-criteria-banner'
import type { StudyForReview } from './review-types'

type ProposalSectionProps = {
    study: StudyForReview
    orgSlug: string
    initialExpanded?: boolean
}

const EVALUATION_CRITERIA = [
    {
        label: 'Feasibility',
        description: 'Can this study be supported with your available data and infrastructure?',
    },
    {
        label: 'Impact',
        description: 'Could the results advance the understanding of teaching and learning?',
    },
    {
        label: 'Researcher background',
        description:
            'Does the researcher have relevant expertise? If a student or post-doc, do they have appropriate faculty or PI supervision?',
    },
]

function StatusBanner({ labName }: { labName: string }) {
    return (
        <ReviewCriteriaBanner
            mb="md"
            testId="status-banner"
            criteriaTestId="evaluation-criteria"
            intro={
                <>
                    {labName} has submitted an initial request requesting permission to use your data. Please review it
                    and share your feedback and decision. Consider evaluating the initial request on these criteria:
                </>
            }
            criteria={EVALUATION_CRITERIA}
        />
    )
}

export function ProposalSection({ study, orgSlug, initialExpanded = true }: ProposalSectionProps) {
    const labName = study.submittingLabName ?? study.submittedByOrgSlug

    return (
        <ProposalRequest
            study={study}
            orgSlug={orgSlug}
            stepLabel="STEP 1"
            heading="Review initial request"
            banner={<StatusBanner labName={labName} />}
            initialExpanded={initialExpanded}
        />
    )
}
