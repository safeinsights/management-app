import { ResearcherProposalView } from '../view/researcher-proposal-view'
import type { ScreenComponentProps } from './types'

// proposal-feedback: read-only proposal (REJECTED/APPROVED/CHANGE-REQUESTED, no code submitted).
// No Proceed button — the change-requested "Edit and resubmit" CTA lives on /submitted, not /view.
export function ProposalFeedbackScreen({ study, orgSlug, dashboardHref }: ScreenComponentProps) {
    return <ResearcherProposalView orgSlug={orgSlug} study={study} dashboardHref={dashboardHref} />
}
