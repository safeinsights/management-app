'use client'

import { ProposalRequest } from '@/components/study/proposal-initial-request'
import { StatusAlert, statusAlertTitle } from '@/components/study/status-alert'
import { proposalReviewHeading } from '@/lib/proposal-review'
import { decisionTimestampForProposalHeader } from '@/lib/studies'
import { reviewerProposalNeedsReviewBanner } from '@/lib/study-banners'
import type { ProposalFeedbackEntry } from '@/server/actions/study.actions'
import type { StudyForReview } from './review-types'

type ProposalSectionProps = {
    study: StudyForReview
    orgSlug: string
    // reviewVersion is the single source of truth for resubmission state, never re-derived from
    // entries.
    priorEntries?: ProposalFeedbackEntry[]
    reviewVersion?: number
}

type StatusBannerProps = {
    labName: string
    reviewVersion: number
    submittedAt: Date | string | null
}

function StatusBanner({ labName, reviewVersion, submittedAt }: StatusBannerProps) {
    const copy = reviewerProposalNeedsReviewBanner({ researchLab: labName, version: reviewVersion })

    return (
        <StatusAlert variant={copy.variant} title={statusAlertTitle(copy.title, submittedAt)}>
            {copy.body}
        </StatusAlert>
    )
}

export function ProposalSection({ study, orgSlug, priorEntries = [], reviewVersion = 1 }: ProposalSectionProps) {
    const labName = study.submittingLabName ?? study.submittedByOrgSlug
    const isResubmission = reviewVersion > 1
    const submittedAt = decisionTimestampForProposalHeader(study, priorEntries)

    return (
        <ProposalRequest
            study={study}
            orgSlug={orgSlug}
            stepLabel="STEP 1"
            heading={proposalReviewHeading(reviewVersion)}
            banner={<StatusBanner labName={labName} reviewVersion={reviewVersion} submittedAt={submittedAt} />}
            initialExpanded={!isResubmission}
        />
    )
}
