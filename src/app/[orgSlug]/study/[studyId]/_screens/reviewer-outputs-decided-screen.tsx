import { ReviewerOutputsDecided } from '../review/reviewer-outputs-decided'
import type { ScreenComponentProps } from './types'

export function ReviewerOutputsDecidedScreen({ study, raw, nav }: Pick<ScreenComponentProps, 'study' | 'raw' | 'nav'>) {
    return <ReviewerOutputsDecided study={study} raw={raw} nav={nav} />
}
