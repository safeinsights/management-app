'use client'

import { ProposalRequest } from '@/components/study/proposal-initial-request'
import { ReviewCriteriaBanner } from '@/components/study/review-criteria-banner'
import { deriveStudyVersion } from '@/lib/studies'
import type { ProposalFeedbackEntry } from '@/server/actions/study.actions'
import type { StudyForReview } from './review-types'

type ProposalSectionProps = {
    study: StudyForReview
    orgSlug: string
    priorEntries?: ProposalFeedbackEntry[]
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

function bannerIntro(labName: string, isResubmission: boolean) {
    const action = isResubmission ? 'has resubmitted a revised initial request' : 'has submitted an initial request'
    const review = isResubmission
        ? 'Please review the changes and share your updated feedback and decision.'
        : 'Please review it and share your feedback and decision.'

    return (
        <>
            {labName} {action} requesting permission to use your data. {review} Consider evaluating based on these
            criteria:
        </>
    )
}

function StatusBanner({ labName, isResubmission }: { labName: string; isResubmission: boolean }) {
    return (
        <ReviewCriteriaBanner
            mb="md"
            testId="status-banner"
            criteriaTestId="evaluation-criteria"
            intro={bannerIntro(labName, isResubmission)}
            criteria={EVALUATION_CRITERIA}
        />
    )
}

export function ProposalSection({ study, orgSlug, priorEntries = [] }: ProposalSectionProps) {
    const labName = study.submittingLabName ?? study.submittedByOrgSlug
    const studyVersion = deriveStudyVersion(priorEntries)
    const isResubmission = studyVersion > 1

    return (
        <ProposalRequest
            study={study}
            orgSlug={orgSlug}
            stepLabel="STEP 1"
            heading={`Review initial request ${isResubmission ? `v${studyVersion}.0` : ''}`}
            banner={<StatusBanner labName={labName} isResubmission={isResubmission} />}
            initialExpanded={!isResubmission}
            statusBadge={isResubmission ? 'Resubmitted on' : undefined}
            entries={priorEntries}
        />
    )
}
