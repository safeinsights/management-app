import type React from 'react'
import type { ScreenId } from '@/lib/study-screen'
import type { ScreenComponentProps } from './types'

// Screens may be async server components (they load their own data). Returned node is awaited
// at the page dispatch (see view/page.tsx) — NOT rendered as a JSX child (which the test harness
// would not resolve).
export type ScreenComponent = (props: ScreenComponentProps) => React.ReactNode | Promise<React.ReactNode>

import { ProposalFeedbackScreen } from './proposal-feedback-screen'

export const SCREEN_COMPONENTS: Partial<Record<ScreenId, ScreenComponent>> = {
    'proposal-feedback': ProposalFeedbackScreen,
}
