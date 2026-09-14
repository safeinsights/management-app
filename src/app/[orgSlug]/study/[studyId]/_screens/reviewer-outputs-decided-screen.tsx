import { ReviewerOutputsDecided } from '../review/reviewer-outputs-decided'
import type { ScreenComponentProps } from './types'

export function ReviewerOutputsDecidedScreen({
    study,
    raw,
    orgSlug,
    dashboardHref,
}: Pick<ScreenComponentProps, 'study' | 'raw' | 'orgSlug' | 'dashboardHref'>) {
    return <ReviewerOutputsDecided orgSlug={orgSlug} study={study} raw={raw} dashboardHref={dashboardHref} />
}
