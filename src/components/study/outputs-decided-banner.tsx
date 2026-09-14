import { FC } from 'react'
import { StatusAlert, statusAlertTitle } from '@/components/study/status-alert'
import { reviewerOutputsDecisionBanner } from '@/lib/study-banners'

type OutputsDecidedBannerProps = {
    resultsErrored: boolean
    resultsApproved: boolean
    labName: string
    reviewerName?: string | null
    decidedAt: Date | string | null
}

export const OutputsDecidedBanner: FC<OutputsDecidedBannerProps> = ({
    resultsErrored,
    resultsApproved,
    labName,
    reviewerName,
    decidedAt,
}) => {
    const copy = reviewerOutputsDecisionBanner(
        { resultsErrored, resultsApproved },
        { researchLab: labName, reviewerName },
    )

    return (
        <StatusAlert variant={copy.variant} title={statusAlertTitle(copy.title, decidedAt)}>
            {copy.body}
        </StatusAlert>
    )
}
