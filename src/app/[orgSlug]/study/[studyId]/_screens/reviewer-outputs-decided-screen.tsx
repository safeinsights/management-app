import { ReviewerOutputsDecided } from '../review/reviewer-outputs-decided'
import type { ScreenComponentProps } from './types'

export function ReviewerOutputsDecidedScreen({ study, orgSlug }: ScreenComponentProps) {
    return <ReviewerOutputsDecided orgSlug={orgSlug} study={study} />
}
