import type React from 'react'
import type { ScreenId } from '@/lib/study-screen'
import type { ScreenComponentProps } from './types'
import { CodeDecisionScreen } from './code-decision-screen'
import { CodeUnderReviewScreen } from './code-under-review-screen'
import { ProposalFeedbackScreen } from './proposal-feedback-screen'
import { StudyResultsScreen } from './study-results-screen'
import { StudyOverviewScreen } from './study-overview-screen'
import { ReviewerProposalReviewScreen } from './reviewer-proposal-review-screen'
import { ReviewerProposalFeedbackScreen } from './reviewer-proposal-feedback-screen'
import { ReviewerAgreementsScreen } from './reviewer-agreements-screen'
import { ReviewerCodeReviewScreen } from './reviewer-code-review-screen'
import { ReviewerCodeFeedbackScreen } from './reviewer-code-feedback-screen'
import { ReviewerOutputsPendingScreen } from './reviewer-outputs-pending-screen'
import { ReviewerStudyResultsScreen } from './reviewer-study-results-screen'

// Screens may be async server components (they load their own data). Returned node is awaited
// at the page dispatch (see view/page.tsx) — NOT rendered as a JSX child (which the test harness
// would not resolve).
export type ScreenComponent = (props: ScreenComponentProps) => React.ReactNode | Promise<React.ReactNode>

// Total: every ScreenId maps to a component, so the dispatch in view/page.tsx is exhaustive and a
// missing screen is a compile error (not a runtime throw).
export const SCREEN_COMPONENTS: Record<ScreenId, ScreenComponent> = {
    'code-approved': CodeDecisionScreen,
    'code-feedback': CodeDecisionScreen,
    'code-under-review': CodeUnderReviewScreen,
    'proposal-feedback': ProposalFeedbackScreen,
    'study-results': StudyResultsScreen,
    'study-overview': StudyOverviewScreen,
    'reviewer-proposal-review': ReviewerProposalReviewScreen,
    'reviewer-proposal-feedback': ReviewerProposalFeedbackScreen,
    'reviewer-agreements': ReviewerAgreementsScreen,
    'reviewer-code-review': ReviewerCodeReviewScreen,
    'reviewer-code-feedback': ReviewerCodeFeedbackScreen,
    'reviewer-outputs-pending': ReviewerOutputsPendingScreen,
    'reviewer-study-results': ReviewerStudyResultsScreen,
}
