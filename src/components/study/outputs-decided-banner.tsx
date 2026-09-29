import { FC } from 'react'
import { DatedStatusBanner } from '@/components/study/dated-status-banner'
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

    return <DatedStatusBanner copy={copy} at={decidedAt} />
}
