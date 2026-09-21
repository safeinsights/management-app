'use client'

import type { FC } from 'react'
import { useMarkOutputsDecisionViewed } from '@/hooks/use-mark-outputs-decision-viewed'

type Props = {
    studyId: string
    isVisible: boolean
}

// Renders nothing. The researcher outputs screens are async server components, so recording the
// view from the client needs a leaf that mounts with them rather than a write during their render,
// which would also fire on link prefetch.
export const MarkOutputsDecisionViewed: FC<Props> = ({ studyId, isVisible }) => {
    useMarkOutputsDecisionViewed({ studyId, isEnabled: isVisible })
    return null
}
