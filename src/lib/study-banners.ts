import { STATUS_ALERT_VARIANT, type StatusAlertVariant } from '@/components/study/status-alert'
import type { StudyStatus } from '@/database/types'
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
