import { FC } from 'react'
import dayjs from 'dayjs'
import { StatusAlert, STATUS_ALERT_SEPARATOR, STATUS_ALERT_VARIANT } from '@/components/study/status-alert'

type OutputsDecidedBannerProps = {
    resultsErrored: boolean
    resultsApproved: boolean
    labName: string
    decidedAt: Date | string | null
}

type BannerCopy = { title: string; body: string }

// resultsErrored = JOB-ERRORED (code run outcome); resultsApproved = FILES-APPROVED vs
// FILES-REJECTED (reviewer's share decision). The two axes are orthogonal → 4 variants.
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
    const dateStr = decidedAt ? ` ${STATUS_ALERT_SEPARATOR} ${dayjs(decidedAt).format('MMM DD, YYYY')}` : ''

    return (
        <StatusAlert variant={STATUS_ALERT_VARIANT.informative} title={`${title}${dateStr}`}>
            {body}
        </StatusAlert>
    )
}
