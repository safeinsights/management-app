import { ReviewerOutputsDecided } from '../review/reviewer-outputs-decided'
import type { ScreenComponentProps } from './types'

export function ReviewerOutputsDecidedScreen({
    study,
    raw,
    orgSlug,
}: Pick<ScreenComponentProps, 'study' | 'raw' | 'orgSlug'>) {
    return <ReviewerOutputsDecided orgSlug={orgSlug} study={study} raw={raw} />
}
