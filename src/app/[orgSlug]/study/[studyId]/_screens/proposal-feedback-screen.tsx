import { Routes } from '@/lib/routes'
import { projectStudyState } from '@/lib/study-screen'
import { ResearcherProposalView } from '../view/researcher-proposal-view'
import type { ScreenComponentProps } from './types'

// proposal-feedback: read-only proposal (REJECTED / APPROVED / CHANGE-REQUESTED). Any APPROVED study
// gets the forward "Proceed to Step 3" → agreements — including an advanced study revisiting this as
// the wizard's first step (?step=proposal, OTTER-614), so the read-only flow can walk forward again.
// CHANGE-REQUESTED's "Edit and resubmit" CTA lives on /submitted, and REJECTED is terminal.
export function ProposalFeedbackScreen({ study, raw, orgSlug, dashboardHref, returnTo }: ScreenComponentProps) {
    const state = projectStudyState(raw)
    const showProceed = state.status === 'APPROVED'
    const agreementsHref = showProceed ? Routes.studyAgreements({ orgSlug, studyId: study.id, returnTo }) : undefined

    return (
        <ResearcherProposalView
            orgSlug={orgSlug}
            study={study}
            dashboardHref={dashboardHref}
            agreementsHref={agreementsHref}
        />
    )
}
