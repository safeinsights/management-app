import { FC } from 'react'
import { StatusAlert, STATUS_ALERT_VARIANT, statusAlertTitle } from '@/components/study/status-alert'

type OutputsDecidedBannerProps = {
    resultsErrored: boolean
    resultsApproved: boolean
    labName: string
    decidedAt: Date | string | null
}

type BannerCopy = { title: string; body: string }

// The run outcome (JOB-ERRORED) and the reviewer's share decision (FILES-APPROVED vs
// FILES-REJECTED) are orthogonal, hence four variants.
function resolveBannerCopy({
    resultsErrored,
    resultsApproved,
    labName,
}: Pick<OutputsDecidedBannerProps, 'resultsErrored' | 'resultsApproved' | 'labName'>): BannerCopy {
    if (resultsErrored && resultsApproved) {
        return {
            title: 'Code errored. Outputs and feedback shared',
            body: `The study code failed to process. Outputs and feedback have been shared with ${labName}. We will notify you when they resubmit.`,
        }
    }
    if (resultsErrored) {
        return {
            title: 'Code errored. Feedback shared',
            body: `The study code failed to process. Feedback has been shared with ${labName} without the outputs. We will notify you when they resubmit.`,
        }
    }
    if (resultsApproved) {
        return {
            title: 'Outputs and feedback shared',
            body: `The outputs from the latest code run were reviewed and shared with ${labName} along with your feedback.`,
        }
    }
    return {
        title: 'Feedback shared',
        body: `Feedback has been shared with ${labName} without the outputs. We will notify you when they resubmit.`,
    }
}

export const OutputsDecidedBanner: FC<OutputsDecidedBannerProps> = ({
    resultsErrored,
    resultsApproved,
    labName,
    decidedAt,
}) => {
    const { title, body } = resolveBannerCopy({ resultsErrored, resultsApproved, labName })

    return (
        <StatusAlert variant={STATUS_ALERT_VARIANT.informative} title={statusAlertTitle(title, decidedAt)}>
            {body}
        </StatusAlert>
    )
}
