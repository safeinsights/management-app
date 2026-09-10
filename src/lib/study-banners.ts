import { STATUS_ALERT_VARIANT, type StatusAlertVariant } from '@/components/study/status-alert'
import type { ReviewDecision, StudyStatus } from '@/database/types'
import type { CodeDecisionStatus } from '@/lib/study-job-status'

export type BannerCopy = {
    variant: StatusAlertVariant
    title: string
    body: string
}

export type BannerParams = {
    dataPartner: string
    /** Submission round. Anything above 1 renders the resubmission title. */
    version?: number
}

const AWAITING_PROPOSAL_REVIEW =
    'An email notification will be sent as your proposal progresses through the review. Reviews typically take 7 to 10 days.'

const awaitingCodeReview = (dataPartner: string) =>
    `Your code and an AI summary of its behavior will be shared with ${dataPartner}. An email notification will be sent as your code progresses through the review. Reviews typically take 7 to 10 days.`

const resubmissionTitle = (noun: string, dataPartner: string, version: number) =>
    version > 1 ? `${noun} v${version}.0 resubmitted to ${dataPartner}` : `${noun} submitted to ${dataPartner}`

export function researcherProposalBanner(
    status: StudyStatus,
    { dataPartner, version = 1 }: BannerParams,
): BannerCopy | null {
    switch (status) {
        case 'PENDING-REVIEW':
            return {
                variant: STATUS_ALERT_VARIANT.informative,
                title: resubmissionTitle('Proposal', dataPartner, version),
                body: AWAITING_PROPOSAL_REVIEW,
            }
        case 'CHANGE-REQUESTED':
            return {
                variant: STATUS_ALERT_VARIANT.action,
                title: 'Revision requested',
                body: `${dataPartner} has reviewed your proposal and requested changes. Read their feedback below, then revise and resubmit.`,
            }
        case 'APPROVED':
            return {
                variant: STATUS_ALERT_VARIANT.success,
                title: 'Proposal approved',
                body: `${dataPartner} has reviewed and approved your proposal. Read their feedback below, then proceed to the next step.`,
            }
        case 'REJECTED':
            return {
                variant: STATUS_ALERT_VARIANT.decline,
                title: 'Proposal declined',
                body: `${dataPartner} has reviewed your proposal and is unable to support it. Read their feedback below for more details.`,
            }
        default:
            return null
    }
}

export function researcherCodeSubmittedBanner({ dataPartner, version = 1 }: BannerParams): BannerCopy {
    return {
        variant: STATUS_ALERT_VARIANT.informative,
        title: resubmissionTitle('Code', dataPartner, version),
        body: awaitingCodeReview(dataPartner),
    }
}

export function researcherCodeDecisionBanner(status: CodeDecisionStatus, { dataPartner }: BannerParams): BannerCopy {
    switch (status) {
        case 'CODE-APPROVED':
            return {
                variant: STATUS_ALERT_VARIANT.success,
                title: 'Code approved',
                body: `${dataPartner} has reviewed and approved your code. A notification will be sent when the study results are available.`,
            }
        case 'CODE-CHANGES-REQUESTED':
            return {
                variant: STATUS_ALERT_VARIANT.action,
                title: 'Revision requested on your code',
                body: `${dataPartner} has reviewed your code and requested changes or more information. Read the feedback below, then update your code and resubmit it.`,
            }
        case 'CODE-REJECTED':
            return {
                variant: STATUS_ALERT_VARIANT.decline,
                title: 'Code declined',
                body: `${dataPartner} has determined this code does not meet the requirements to proceed. Please review their feedback below. No further code submissions will be accepted for this study, but you may submit a new study proposal. If you believe this decision was made in error, contact SafeInsights.`,
            }
    }
}

export type ReviewerBannerParams = {
    researchLab: string
    reviewerName?: string | null
    version?: number
}

const attributedTo = (action: string, reviewerName?: string | null) =>
    reviewerName ? `${action} by ${reviewerName}` : action

export function reviewerProposalNeedsReviewBanner({ researchLab, version = 1 }: ReviewerBannerParams): BannerCopy {
    return {
        variant: STATUS_ALERT_VARIANT.action,
        title:
            version > 1 ? `Revised proposal submitted by ${researchLab}` : `New proposal submitted by ${researchLab}`,
        body: `${researchLab} is requesting permission to run their code on your data. Review the proposal below and share your decision and feedback.`,
    }
}

export function reviewerProposalDecisionBanner(
    decision: ReviewDecision,
    { researchLab, reviewerName }: ReviewerBannerParams,
): BannerCopy {
    switch (decision) {
        case 'APPROVE':
            return {
                variant: STATUS_ALERT_VARIANT.informative,
                title: attributedTo('Proposal approved', reviewerName),
                body: `This proposal has been approved. An email notification will be sent when ${researchLab} moves to the next step.`,
            }
        case 'NEEDS-CLARIFICATION':
            return {
                variant: STATUS_ALERT_VARIANT.informative,
                title: attributedTo('Revision requested', reviewerName),
                body: `A revision has been requested. An email notification will be sent when ${researchLab} resubmits the proposal.`,
            }
        case 'REJECT':
            return {
                variant: STATUS_ALERT_VARIANT.decline,
                title: attributedTo('Proposal declined', reviewerName),
                body: 'This proposal has been declined. No further action is required.',
            }
    }
}

export function reviewerCodeNeedsReviewBanner({ researchLab, version = 1 }: ReviewerBannerParams): BannerCopy {
    return {
        variant: STATUS_ALERT_VARIANT.action,
        title: version > 1 ? `Revised code submitted by ${researchLab}` : `New code submitted by ${researchLab}`,
        body: 'Review the code files, security log, and AI summary to inform your code evaluation and decision.',
    }
}

export function reviewerCodeDecisionBanner(
    decision: ReviewDecision,
    { researchLab, reviewerName }: ReviewerBannerParams,
): BannerCopy {
    switch (decision) {
        // Happy path never shows this: approve queues the job, so reviewer-outputs-pending
        // (isExecuting) outranks reviewer-code-feedback. Surfaces only if CODE-APPROVED is
        // set but execution never started.
        case 'APPROVE':
            return {
                variant: STATUS_ALERT_VARIANT.informative,
                title: attributedTo('Code approved', reviewerName),
                body: 'This code has been approved. You will be notified when the study results are available for review.',
            }
        case 'NEEDS-CLARIFICATION':
            return {
                variant: STATUS_ALERT_VARIANT.informative,
                title: attributedTo('Revision requested', reviewerName),
                body: `A revision has been requested. An email notification will be sent when ${researchLab} resubmits their code.`,
            }
        case 'REJECT':
            return {
                variant: STATUS_ALERT_VARIANT.decline,
                title: attributedTo('Code declined', reviewerName),
                body: 'This study code was rejected and the study was ended. No further action is required at this time.',
            }
    }
}

type ReviewerOutputsDecisionFlags = {
    resultsErrored: boolean
    resultsApproved: boolean
}

export function reviewerOutputsDecisionBanner(
    { resultsErrored, resultsApproved }: ReviewerOutputsDecisionFlags,
    { researchLab, reviewerName }: ReviewerBannerParams,
): BannerCopy {
    if (resultsErrored && resultsApproved) {
        return {
            variant: STATUS_ALERT_VARIANT.informative,
            title: attributedTo('Code errored. Outputs and feedback shared', reviewerName),
            body: `The study code failed to process. Outputs and feedback have been shared with ${researchLab}. We will notify you when they resubmit.`,
        }
    }
    if (resultsErrored) {
        return {
            variant: STATUS_ALERT_VARIANT.informative,
            title: attributedTo('Code errored. Feedback shared', reviewerName),
            body: `The study code failed to process. Feedback has been shared with ${researchLab} without the outputs. We will notify you when they resubmit.`,
        }
    }
    if (resultsApproved) {
        return {
            variant: STATUS_ALERT_VARIANT.informative,
            title: attributedTo('Outputs and feedback shared', reviewerName),
            body: `The outputs from the latest code run were reviewed and shared with ${researchLab} along with your feedback.`,
        }
    }
    return {
        variant: STATUS_ALERT_VARIANT.informative,
        title: attributedTo('Feedback shared', reviewerName),
        body: `Feedback has been shared with ${researchLab} without the outputs. We will notify you when they resubmit.`,
    }
}
